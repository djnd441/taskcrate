use crate::audit;
use crate::collaboration;
use crate::error::AppError;
use crate::models::{
    now_iso, AiChatMessage, AiChatResult, AiConnectionResult, AiConversation,
    AiConversationSummary, AiProvider, AiToolCall, ProjectCreateInput, Settings, TagCreateInput,
    TaskCommentInput, TaskCreateInput, TaskFilter, TaskKind, TaskStatus, TaskUpdateInput,
};
use crate::repositories;
use futures_util::StreamExt;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::time::Instant;
use tauri::ipc::Channel;
use uuid::Uuid;

const DESTRUCTIVE_TOOLS: &[&str] = &[
    "soft_delete_task",
    "hard_delete_task",
    "restore_task",
    "archive_task",
    "unarchive_task",
];

pub fn api_key_configured(data_dir: &Path) -> bool {
    crate::secrets::secret_configured(data_dir, crate::secrets::AI_API_KEY)
}

pub fn save_api_key(data_dir: &Path, api_key: &str) -> Result<(), AppError> {
    crate::secrets::set_secret(data_dir, crate::secrets::AI_API_KEY, api_key.trim())
}

fn read_api_key(data_dir: &Path) -> Result<Option<String>, AppError> {
    crate::secrets::get_secret(data_dir, crate::secrets::AI_API_KEY)
}

fn parse_ai_messages(value: String) -> Vec<AiChatMessage> {
    serde_json::from_str(&value).unwrap_or_default()
}

fn provider_from_str(value: &str) -> AiProvider {
    match value {
        "local" => AiProvider::Local,
        "cloud" => AiProvider::Cloud,
        _ => AiProvider::Off,
    }
}

pub fn list_ai_conversations(conn: &Connection) -> Result<Vec<AiConversationSummary>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, provider, model, messages, updated_at
         FROM ai_conversations ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let messages = parse_ai_messages(row.get::<_, String>("messages")?);
        Ok(AiConversationSummary {
            id: row.get("id")?,
            title: row.get("title")?,
            provider: provider_from_str(&row.get::<_, String>("provider")?),
            model: row.get("model")?,
            message_count: messages.len(),
            updated_at: row.get("updated_at")?,
        })
    })?;
    let mut conversations = Vec::new();
    for row in rows {
        conversations.push(row?);
    }
    Ok(conversations)
}

pub fn get_ai_conversation(
    conn: &Connection,
    id: &str,
) -> Result<Option<AiConversation>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, provider, model, messages, created_at, updated_at
         FROM ai_conversations WHERE id = ?",
    )?;
    let conversation = stmt
        .query_row(rusqlite::params![id], |row| {
            Ok(AiConversation {
                id: row.get("id")?,
                title: row.get("title")?,
                provider: provider_from_str(&row.get::<_, String>("provider")?),
                model: row.get("model")?,
                messages: parse_ai_messages(row.get::<_, String>("messages")?),
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })
        .optional()?;
    Ok(conversation)
}

pub fn create_ai_conversation(
    conn: &Connection,
    provider: AiProvider,
    model: &str,
) -> Result<AiConversation, AppError> {
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO ai_conversations (id, title, provider, model, messages, created_at, updated_at)
         VALUES (?1, '新对话', ?2, ?3, '[]', ?4, ?4)",
        rusqlite::params![id, provider.as_str(), model, now],
    )?;
    get_ai_conversation(conn, &id)?
        .ok_or_else(|| AppError::Validation("AI 会话创建失败".to_string()))
}

pub fn save_ai_conversation(
    conn: &Connection,
    conversation: AiConversation,
) -> Result<AiConversation, AppError> {
    let messages = serde_json::to_string(&conversation.messages)
        .map_err(|e| AppError::Validation(format!("AI 会话序列化失败：{e}")))?;
    let now = now_iso();
    let title = if conversation.title.trim().is_empty() {
        "新对话".to_string()
    } else {
        conversation.title.trim().to_string()
    };
    conn.execute(
        "INSERT INTO ai_conversations (id, title, provider, model, messages, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           provider = excluded.provider,
           model = excluded.model,
           messages = excluded.messages,
           updated_at = excluded.updated_at",
        rusqlite::params![
            conversation.id,
            title,
            conversation.provider.as_str(),
            conversation.model,
            messages,
            now
        ],
    )?;
    get_ai_conversation(conn, &conversation.id)?
        .ok_or_else(|| AppError::Validation("AI 会话不存在".to_string()))
}

pub fn delete_ai_conversation(conn: &Connection, id: &str) -> Result<(), AppError> {
    let changed = conn.execute(
        "DELETE FROM ai_conversations WHERE id = ?",
        rusqlite::params![id],
    )?;
    if changed == 0 {
        return Err(AppError::Validation("AI 会话不存在".to_string()));
    }
    Ok(())
}

pub async fn chat(
    data_dir: &Path,
    messages: Vec<AiChatMessage>,
    settings: &Settings,
    channel: &Channel<AiStreamEvent>,
) -> Result<AiChatResult, AppError> {
    if settings.ai_provider == AiProvider::Off {
        return Err(AppError::Validation(
            "AI 助手未启用，请先在设置中配置".to_string(),
        ));
    }
    if settings.ai_model.trim().is_empty() {
        return Err(AppError::Validation("AI 模型未配置".to_string()));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Validation(format!("HTTP 客户端创建失败：{e}")))?;
    let api_key = read_api_key(data_dir)?;
    let url = format!(
        "{}/chat/completions",
        settings.ai_base_url.trim_end_matches('/')
    );
    let mut request = client.post(&url).json(&build_request(messages, settings));
    if let Some(api_key) = api_key {
        request = request.bearer_auth(api_key);
    }

    let response = request
        .send()
        .await
        .map_err(|e| AppError::Validation(format!("AI 请求失败：{e}")))?;
    let status = response.status();
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();
    let mut full_body: Vec<u8> = Vec::new();
    let mut full_content = String::new();
    let mut tool_calls: Vec<PartialToolCall> = Vec::new();
    let mut saw_stream = false;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Validation(format!("AI 流式响应失败：{e}")))?;
        full_body.extend_from_slice(&chunk);
        buffer.extend_from_slice(&chunk);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line_bytes = buffer[..position].to_vec();
            buffer.drain(..=position);
            let line = String::from_utf8_lossy(&line_bytes);
            if process_stream_line(&line, &mut full_content, &mut tool_calls, channel) {
                saw_stream = true;
            }
        }
    }
    if !buffer.is_empty() {
        let line = String::from_utf8_lossy(&buffer);
        if process_stream_line(&line, &mut full_content, &mut tool_calls, channel) {
            saw_stream = true;
        }
    }

    if !status.is_success() {
        let body: Value = serde_json::from_slice(&full_body).unwrap_or_default();
        let message = body
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("未知错误");
        let error_message = format!("AI 接口返回 {status}：{message}");
        let _ = channel.send(AiStreamEvent::Error {
            message: error_message.clone(),
        });
        return Err(AppError::Validation(error_message));
    }

    if saw_stream {
        if full_content.trim().is_empty() && tool_calls.is_empty() {
            return Err(AppError::Validation("AI 未返回任何回复".to_string()));
        }
        let result = AiChatResult {
            text: if full_content.trim().is_empty() {
                None
            } else {
                Some(full_content)
            },
            tool_calls: tool_calls
                .into_iter()
                .filter(|call| !call.name.is_empty())
                .map(|call| AiToolCall {
                    id: call.id,
                    name: call.name,
                    arguments: call.arguments,
                })
                .collect(),
        };
        let _ = channel.send(AiStreamEvent::Done {
            result: result.clone(),
        });
        return Ok(result);
    }

    let parsed: ChatResponse = serde_json::from_slice(&full_body)
        .map_err(|e| AppError::Validation(format!("AI 响应格式无效：{e}")))?;
    let choice = parsed
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Validation("AI 未返回任何回复".to_string()))?;
    let result = AiChatResult {
        text: choice.message.content,
        tool_calls: choice
            .message
            .tool_calls
            .unwrap_or_default()
            .into_iter()
            .map(|call| AiToolCall {
                id: call.id,
                name: call.function.name,
                arguments: call.function.arguments,
            })
            .collect(),
    };
    let _ = channel.send(AiStreamEvent::Done {
        result: result.clone(),
    });
    Ok(result)
}

fn process_stream_line(
    line: &str,
    full_content: &mut String,
    tool_calls: &mut Vec<PartialToolCall>,
    channel: &Channel<AiStreamEvent>,
) -> bool {
    let line = line.trim_end_matches('\r');
    if line.is_empty() {
        return false;
    }
    let Some(payload) = line.strip_prefix("data:") else {
        return false;
    };
    let payload = payload.trim();
    if payload == "[DONE]" {
        return true;
    }
    let Ok(parsed) = serde_json::from_str::<StreamChunk>(payload) else {
        return false;
    };
    for choice in parsed.choices {
        if let Some(content) = choice.delta.content {
            if !content.is_empty() {
                full_content.push_str(&content);
                let _ = channel.send(AiStreamEvent::Delta { content });
            }
        }
        if let Some(deltas) = choice.delta.tool_calls {
            for delta in deltas {
                let index = delta.index;
                while tool_calls.len() <= index {
                    tool_calls.push(PartialToolCall::default());
                }
                if let Some(id) = delta.id {
                    tool_calls[index].id = id;
                }
                if let Some(name) = delta.function.as_ref().and_then(|f| f.name.as_ref()) {
                    tool_calls[index].name = name.clone();
                }
                if let Some(arguments) = delta.function.as_ref().and_then(|f| f.arguments.as_ref())
                {
                    tool_calls[index].arguments.push_str(arguments);
                }
            }
        }
    }
    true
}

pub async fn test_connection(
    data_dir: &Path,
    settings: &Settings,
) -> Result<AiConnectionResult, AppError> {
    if settings.ai_provider == AiProvider::Off {
        return Err(AppError::Validation("AI 助手未启用".to_string()));
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Validation(format!("HTTP 客户端创建失败：{e}")))?;
    let api_key = read_api_key(data_dir)?;
    let url = format!(
        "{}/chat/completions",
        settings.ai_base_url.trim_end_matches('/')
    );
    let payload = json!({
        "model": settings.ai_model,
        "messages": [{ "role": "user", "content": "ping" }],
        "max_tokens": 1,
        "stream": false
    });
    let mut request = client.post(&url).json(&payload);
    if let Some(api_key) = api_key {
        request = request.bearer_auth(api_key);
    }
    let started = Instant::now();
    let response = request
        .send()
        .await
        .map_err(|e| AppError::Validation(format!("连接失败：{e}")))?;
    let latency_ms = started.elapsed().as_millis() as u64;
    let status = response.status();
    if !status.is_success() {
        let body: Value = response.json().await.unwrap_or_default();
        let message = body
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("未知错误");
        return Ok(AiConnectionResult {
            ok: false,
            latency_ms: Some(latency_ms),
            model: Some(settings.ai_model.clone()),
            message: format!("连接失败（{status}）：{message}"),
        });
    }
    Ok(AiConnectionResult {
        ok: true,
        latency_ms: Some(latency_ms),
        model: Some(settings.ai_model.clone()),
        message: "连接成功".to_string(),
    })
}

pub fn execute_tool(
    conn: &Connection,
    name: &str,
    args: Value,
    confirmed: bool,
) -> Result<Value, AppError> {
    if DESTRUCTIVE_TOOLS.contains(&name) && !confirmed {
        return Err(AppError::Validation(
            "该操作需要用户确认后才能执行".to_string(),
        ));
    }
    match name {
        "create_task" => {
            let input: TaskCreateInput = parse_args(args)?;
            let created = repositories::create_task(conn, input)?;
            let _ = audit::log_action(
                conn,
                "create",
                "task",
                Some(&created.id),
                &format!("AI 创建任务：{}", created.title),
            );
            to_value(created)
        }
        "list_tasks" | "search_tasks" => {
            let args: ListTasksArgs = parse_args(args)?;
            let filter = TaskFilter {
                query: args.query,
                statuses: args.statuses,
                priorities: args.priorities,
                project_id: args.project_id,
                include_archived: args.include_archived.unwrap_or(false),
                include_deleted: args.include_deleted.unwrap_or(false),
                ..Default::default()
            };
            let page =
                repositories::list_tasks(conn, filter, crate::models::TaskSort::default(), 0, 500)?;
            let items = page
                .items
                .into_iter()
                .filter(|task| {
                    args.task_kind
                        .map(|kind| task.task_kind == kind)
                        .unwrap_or(true)
                })
                .map(to_value)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(json!({ "total": items.len(), "items": items }))
        }
        "get_task" => {
            let args: IdArgs = parse_args(args)?;
            match repositories::get_task(conn, &args.id)? {
                Some(task) => to_value(task),
                None => Err(AppError::TaskNotFound(args.id)),
            }
        }
        "update_task" => {
            let args: UpdateTaskArgs = parse_args(args)?;
            let updated = repositories::update_task(conn, &args.id, args.input)?;
            let _ = audit::log_action(
                conn,
                "update",
                "task",
                Some(&updated.id),
                &format!("AI 更新任务：{}", updated.title),
            );
            to_value(updated)
        }
        "complete_task" => {
            let args: IdArgs = parse_args(args)?;
            let task = repositories::transition_task_status(conn, &args.id, TaskStatus::Completed)?;
            let _ = audit::log_action(
                conn,
                "transition",
                "task",
                Some(&task.id),
                &format!("AI 完成任务：{}", task.title),
            );
            to_value(task)
        }
        "transition_task_status" => {
            let args: TransitionArgs = parse_args(args)?;
            let task = repositories::transition_task_status(conn, &args.id, args.status)?;
            let _ = audit::log_action(
                conn,
                "transition",
                "task",
                Some(&task.id),
                &format!("AI 状态变更：{}", task.title),
            );
            to_value(task)
        }
        "archive_task" => {
            let args: IdArgs = parse_args(args)?;
            let task = repositories::archive_task(conn, &args.id)?;
            let _ = audit::log_action(
                conn,
                "archive",
                "task",
                Some(&task.id),
                &format!("AI 归档任务：{}", task.title),
            );
            to_value(task)
        }
        "unarchive_task" => {
            let args: IdArgs = parse_args(args)?;
            let task = repositories::unarchive_task(conn, &args.id)?;
            let _ = audit::log_action(
                conn,
                "unarchive",
                "task",
                Some(&task.id),
                &format!("AI 取消归档任务：{}", task.title),
            );
            to_value(task)
        }
        "soft_delete_task" => {
            let args: IdArgs = parse_args(args)?;
            let task = repositories::soft_delete_task(conn, &args.id)?;
            let _ = audit::log_action(
                conn,
                "delete",
                "task",
                Some(&task.id),
                &format!("AI 删除任务：{}", task.title),
            );
            to_value(task)
        }
        "restore_task" => {
            let args: IdArgs = parse_args(args)?;
            let task = repositories::restore_task(conn, &args.id)?;
            let _ = audit::log_action(
                conn,
                "restore",
                "task",
                Some(&task.id),
                &format!("AI 恢复任务：{}", task.title),
            );
            to_value(task)
        }
        "hard_delete_task" => {
            let args: IdArgs = parse_args(args)?;
            if let Ok(Some(task)) = repositories::get_task(conn, &args.id) {
                let _ = audit::log_action(
                    conn,
                    "hard_delete",
                    "task",
                    Some(&task.id),
                    &format!("AI 彻底删除任务：{}", task.title),
                );
            }
            repositories::hard_delete_task(conn, &args.id)?;
            Ok(json!({ "deleted": true }))
        }
        "create_project" => {
            let input: ProjectCreateInput = parse_args(args)?;
            let created = repositories::create_project(conn, input)?;
            let _ = audit::log_action(
                conn,
                "create",
                "project",
                Some(&created.id),
                &format!("AI 创建项目：{}", created.name),
            );
            to_value(created)
        }
        "create_tag" => {
            let input: TagCreateInput = parse_args(args)?;
            let created = repositories::create_tag(conn, input)?;
            let _ = audit::log_action(
                conn,
                "create",
                "tag",
                Some(&created.id),
                &format!("AI 创建标签：{}", created.name),
            );
            to_value(created)
        }
        "add_task_comment" => {
            let args: AddCommentArgs = parse_args(args)?;
            let input = TaskCommentInput {
                task_id: args.task_id,
                author: if args.author.trim().is_empty() {
                    "AI 助手".to_string()
                } else {
                    args.author
                },
                content: args.content,
            };
            let comment = collaboration::add_task_comment(conn, input)?;
            let _ = audit::log_action(
                conn,
                "comment",
                "task",
                Some(&comment.task_id),
                &format!("AI 评论任务：{}", comment.content),
            );
            to_value(comment)
        }
        "list_due_tasks" => {
            let args: DueTasksArgs = parse_args(args)?;
            let days = args.within_days.unwrap_or(7).clamp(1, 90);
            let now = now_iso();
            let until = (chrono::Utc::now() + chrono::Duration::days(days))
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
            let page = repositories::list_tasks(
                conn,
                TaskFilter {
                    statuses: Some(vec![TaskStatus::Todo, TaskStatus::InProgress]),
                    due_from: Some(now),
                    due_until: Some(until),
                    ..Default::default()
                },
                crate::models::TaskSort::default(),
                0,
                args.limit.unwrap_or(50).clamp(1, 200),
            )?;
            let items = page
                .items
                .into_iter()
                .map(to_value)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(json!({ "total": items.len(), "items": items }))
        }
        "get_task_stats" => task_stats(conn),
        "list_projects" => {
            let projects = repositories::list_projects(conn, true)?;
            let items = projects
                .into_iter()
                .map(to_value)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(json!({ "total": items.len(), "items": items }))
        }
        "list_tags" => {
            let tags = repositories::list_tags(conn)?;
            let items = tags
                .into_iter()
                .map(to_value)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(json!({ "total": items.len(), "items": items }))
        }
        "list_children" => {
            let args: IdArgs = parse_args(args)?;
            let page = repositories::list_tasks(
                conn,
                TaskFilter {
                    include_archived: true,
                    include_deleted: true,
                    ..Default::default()
                },
                crate::models::TaskSort::default(),
                0,
                500,
            )?;
            let children = page
                .items
                .into_iter()
                .filter(|task| task.parent_id.as_deref() == Some(args.id.as_str()))
                .map(to_value)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(json!({ "total": children.len(), "items": children }))
        }
        _ => Err(AppError::Validation(format!("未知 AI 工具：{name}"))),
    }
}

fn count_tasks_where(conn: &Connection, condition: &str) -> Result<i64, AppError> {
    let sql = format!("SELECT COUNT(*) FROM tasks WHERE {condition}");
    Ok(conn.query_row(&sql, [], |row| row.get(0))?)
}

fn task_stats(conn: &Connection) -> Result<Value, AppError> {
    let now = now_iso();
    let start_of_today = format!("{}T00:00:00.000Z", chrono::Utc::now().format("%Y-%m-%d"));
    let soon = (chrono::Utc::now() + chrono::Duration::days(7))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let active = "deleted_at IS NULL AND archived_at IS NULL AND status IN ('todo', 'in_progress')";
    let total_active = count_tasks_where(conn, active)?;
    let todo = count_tasks_where(
        conn,
        "status = 'todo' AND deleted_at IS NULL AND archived_at IS NULL",
    )?;
    let in_progress = count_tasks_where(
        conn,
        "status = 'in_progress' AND deleted_at IS NULL AND archived_at IS NULL",
    )?;
    let completed = count_tasks_where(
        conn,
        "status = 'completed' AND deleted_at IS NULL AND archived_at IS NULL",
    )?;
    let cancelled = count_tasks_where(
        conn,
        "status = 'cancelled' AND deleted_at IS NULL AND archived_at IS NULL",
    )?;
    let overdue = count_tasks_where(
        conn,
        &format!("{active} AND due_at IS NOT NULL AND due_at < '{now}'"),
    )?;
    let due_soon = count_tasks_where(
        conn,
        &format!("{active} AND due_at IS NOT NULL AND due_at >= '{now}' AND due_at <= '{soon}'"),
    )?;
    let high_priority = count_tasks_where(
        conn,
        &format!("{active} AND priority IN ('high', 'urgent')"),
    )?;
    let completed_today = count_tasks_where(
        conn,
        &format!(
            "status = 'completed' AND deleted_at IS NULL AND archived_at IS NULL AND completed_at >= '{start_of_today}'"
        ),
    )?;
    let projects: i64 = conn.query_row(
        "SELECT COUNT(*) FROM projects WHERE is_archived = 0",
        [],
        |row| row.get(0),
    )?;
    let tags: i64 = conn.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?;
    Ok(json!({
        "totalActive": total_active,
        "todo": todo,
        "inProgress": in_progress,
        "completed": completed,
        "cancelled": cancelled,
        "overdue": overdue,
        "dueSoon": due_soon,
        "highPriority": high_priority,
        "completedToday": completed_today,
        "projects": projects,
        "tags": tags,
        "generatedAt": now,
    }))
}

fn build_request(messages: Vec<AiChatMessage>, settings: &Settings) -> Value {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M");
    let system_prompt = format!(
        "你是 TaskCrate 任务管理助手。当前 UTC 时间：{now}。你可以使用提供的工具帮助用户创建、查找、修改、删除任务，也能管理项目、标签、评论和统计概况。创建任务时，主任务可以包含大任务和小任务，一次创建多个层级时请使用 children 传入子任务。非破坏性工具会自动执行；删除、归档、取消归档、恢复、彻底删除等破坏性操作必须先说明并等待用户确认，确认后由前端执行。所有工具参数必须是合法 JSON，回答使用简洁中文。不要输出原始 JSON、工具返回内容或代码，除非用户明确要求代码；工具执行结果请用自然语言总结。"
    );
    let mut request_messages = vec![json!({
        "role": "system",
        "content": system_prompt,
    })];
    for message in messages {
        let mut item = json!({
            "role": message.role,
            "content": message.content,
        });
        if !message.tool_calls.is_empty() {
            item["tool_calls"] = Value::Array(
                message
                    .tool_calls
                    .into_iter()
                    .map(|call| {
                        json!({
                            "id": call.id,
                            "type": "function",
                            "function": {
                                "name": call.name,
                                "arguments": call.arguments
                            }
                        })
                    })
                    .collect(),
            );
        }
        if let Some(tool_call_id) = message.tool_call_id {
            item["tool_call_id"] = json!(tool_call_id);
        }
        request_messages.push(item);
    }
    let mut request = json!({
        "model": settings.ai_model,
        "messages": request_messages,
        "temperature": settings.ai_temperature,
        "stream": true
    });
    if settings.ai_tools_enabled {
        request["tools"] = tools();
    }
    request
}

fn tools() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "create_task",
                "description": "创建主任务、大任务或小任务，可一次创建多个层级，也可附带项目、优先级、负责人、资源和子任务。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "taskKind": { "type": "string", "enum": ["main", "major", "minor"] },
                        "notes": { "type": "string" },
                        "priority": { "type": "string", "enum": ["none", "low", "medium", "high", "urgent"] },
                        "status": { "type": "string", "enum": ["todo", "in_progress", "completed", "cancelled"] },
                        "projectId": { "type": "string" },
                        "parentId": { "type": "string" },
                        "dueAt": { "type": "string" },
                        "startAt": { "type": "string" },
                        "assignee": { "type": "string" },
                        "doneCriteria": { "type": "string" },
                        "budget": { "type": "string" },
                        "tagIds": { "type": "array", "items": { "type": "string" } },
                        "resources": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": { "type": "string" },
                                    "kind": { "type": "string" },
                                    "quantity": { "type": "string" },
                                    "unit": { "type": "string" },
                                    "notes": { "type": "string" }
                                },
                                "required": ["name"]
                            }
                        },
                        "children": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": { "type": "string" },
                                    "taskKind": { "type": "string", "enum": ["main", "major", "minor"] },
                                    "notes": { "type": "string" },
                                    "priority": { "type": "string", "enum": ["none", "low", "medium", "high", "urgent"] },
                                    "dueAt": { "type": "string" }
                                },
                                "required": ["title"]
                            }
                        }
                    },
                    "required": ["title"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_tasks",
                "description": "按关键词、状态、优先级、项目或任务层级查找任务。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "statuses": { "type": "array", "items": { "type": "string" } },
                        "priorities": { "type": "array", "items": { "type": "string" } },
                        "projectId": { "type": "string" },
                        "taskKind": { "type": "string", "enum": ["main", "major", "minor"] }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_task",
                "description": "根据 ID 获取单个任务详情。",
                "parameters": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_task",
                "description": "修改任务标题、状态、优先级、项目、备注、截止时间、负责人、标签等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "title": { "type": "string" },
                        "status": { "type": "string", "enum": ["todo", "in_progress", "completed", "cancelled"] },
                        "priority": { "type": "string", "enum": ["none", "low", "medium", "high", "urgent"] },
                        "projectId": { "type": ["string", "null"] },
                        "notes": { "type": "string" },
                        "dueAt": { "type": ["string", "null"] },
                        "startAt": { "type": ["string", "null"] },
                        "assignee": { "type": ["string", "null"] },
                        "tagIds": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "complete_task",
                "description": "将任务标记为已完成。",
                "parameters": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "transition_task_status",
                "description": "将任务状态切换为待办、进行中、已完成或已取消。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "status": { "type": "string", "enum": ["todo", "in_progress", "completed", "cancelled"] }
                    },
                    "required": ["id", "status"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "archive_task",
                "description": "归档任务，需要用户确认。",
                "parameters": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "unarchive_task",
                "description": "取消归档任务，需要用户确认。",
                "parameters": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "soft_delete_task",
                "description": "将任务移入回收站，需要用户确认。",
                "parameters": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "restore_task",
                "description": "从回收站恢复任务，需要用户确认。",
                "parameters": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "hard_delete_task",
                "description": "彻底删除任务，不可恢复，需要用户确认。",
                "parameters": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_children",
                "description": "列出指定主任务或大任务下的直接子任务。",
                "parameters": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } },
                    "required": ["id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_due_tasks",
                "description": "查看未来 N 天内待办或进行中的到期任务，默认未来 7 天。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "withinDays": { "type": "integer" },
                        "limit": { "type": "integer" }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_task_stats",
                "description": "获取任务统计概况，包括待办、进行中、已完成、逾期、紧急、今日完成等数量。",
                "parameters": { "type": "object", "properties": {} }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_projects",
                "description": "列出所有项目。",
                "parameters": { "type": "object", "properties": {} }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_project",
                "description": "创建项目。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "color": { "type": "string" }
                    },
                    "required": ["name"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_tags",
                "description": "列出所有标签。",
                "parameters": { "type": "object", "properties": {} }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_tag",
                "description": "创建标签。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "color": { "type": "string" }
                    },
                    "required": ["name"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "add_task_comment",
                "description": "给指定任务添加评论。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "taskId": { "type": "string" },
                        "content": { "type": "string" },
                        "author": { "type": "string" }
                    },
                    "required": ["taskId", "content"]
                }
            }
        }
    ])
}

fn to_value<T: serde::Serialize>(value: T) -> Result<Value, AppError> {
    serde_json::to_value(value).map_err(|e| AppError::Validation(format!("结果序列化失败：{e}")))
}

fn parse_args<T: for<'de> Deserialize<'de>>(args: Value) -> Result<T, AppError> {
    serde_json::from_value(args).map_err(|e| AppError::Validation(format!("工具参数无效：{e}")))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListTasksArgs {
    query: Option<String>,
    statuses: Option<Vec<TaskStatus>>,
    priorities: Option<Vec<crate::models::Priority>>,
    project_id: Option<Option<String>>,
    task_kind: Option<TaskKind>,
    include_archived: Option<bool>,
    include_deleted: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdArgs {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransitionArgs {
    id: String,
    status: TaskStatus,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateTaskArgs {
    id: String,
    #[serde(flatten)]
    input: TaskUpdateInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCommentArgs {
    task_id: String,
    content: String,
    #[serde(default)]
    author: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DueTasksArgs {
    within_days: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum AiStreamEvent {
    Delta { content: String },
    Done { result: AiChatResult },
    Error { message: String },
}

#[derive(Debug, Default)]
struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<StreamDeltaToolCall>>,
}

#[derive(Debug, Deserialize)]
struct StreamDeltaToolCall {
    #[serde(default)]
    index: usize,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<StreamDeltaFunction>,
}

#[derive(Debug, Deserialize)]
struct StreamDeltaFunction {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Debug, Deserialize)]
struct ResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<ResponseToolCall>>,
}

#[derive(Debug, Deserialize)]
struct ResponseToolCall {
    id: String,
    function: ResponseFunction,
}

#[derive(Debug, Deserialize)]
struct ResponseFunction {
    name: String,
    arguments: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::Priority;

    fn test_db() -> Connection {
        let conn = db::open_in_memory().expect("open in-memory db");
        db::migrate(&conn).expect("migrate");
        db::seed_defaults(&conn).expect("seed defaults");
        conn
    }

    #[test]
    fn create_and_list_tasks_through_ai_tools() {
        let conn = test_db();
        let created = execute_tool(
            &conn,
            "create_task",
            json!({
                "title": "AI 创建的任务",
                "priority": "high",
                "taskKind": "main"
            }),
            false,
        )
        .unwrap();
        assert_eq!(created["title"], "AI 创建的任务");
        assert_eq!(created["priority"], "high");

        let listed = execute_tool(&conn, "list_tasks", json!({}), false).unwrap();
        assert_eq!(listed["total"], 1);
    }

    #[test]
    fn destructive_tool_requires_confirmation() {
        let conn = test_db();
        let created =
            execute_tool(&conn, "create_task", json!({ "title": "待删除" }), false).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        let blocked = execute_tool(&conn, "soft_delete_task", json!({ "id": id }), false);
        assert!(blocked.is_err());

        let deleted = execute_tool(&conn, "soft_delete_task", json!({ "id": id }), true).unwrap();
        assert_eq!(deleted["deletedAt"].as_str().is_some(), true);
    }

    #[test]
    fn conversation_crud_roundtrip() {
        let conn = test_db();
        let mut conversation = create_ai_conversation(&conn, AiProvider::Local, "qwen2.5").unwrap();
        assert_eq!(conversation.title, "新对话");

        conversation.messages.push(AiChatMessage {
            role: "user".to_string(),
            content: Some("帮我创建任务".to_string()),
            tool_call_id: None,
            tool_calls: Vec::new(),
        });
        let saved = save_ai_conversation(&conn, conversation.clone()).unwrap();
        assert_eq!(saved.messages.len(), 1);

        let summaries = list_ai_conversations(&conn).unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].message_count, 1);

        let loaded = get_ai_conversation(&conn, &conversation.id)
            .unwrap()
            .unwrap();
        assert_eq!(loaded.messages[0].content.as_deref(), Some("帮我创建任务"));

        delete_ai_conversation(&conn, &conversation.id).unwrap();
        assert!(list_ai_conversations(&conn).unwrap().is_empty());
    }

    #[test]
    fn ai_tools_manage_projects_tags_comments_and_stats() {
        let conn = test_db();
        let due_at = (chrono::Utc::now() + chrono::Duration::days(2))
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let created = execute_tool(
            &conn,
            "create_task",
            json!({
                "title": "到期任务",
                "taskKind": "main",
                "dueAt": due_at.clone()
            }),
            false,
        )
        .unwrap();
        assert_eq!(created["title"], "到期任务");
        assert_eq!(created["dueAt"], due_at);

        let project = execute_tool(
            &conn,
            "create_project",
            json!({ "name": "网站改版" }),
            false,
        )
        .unwrap();
        assert_eq!(project["name"], "网站改版");

        let tag = execute_tool(&conn, "create_tag", json!({ "name": "AI 新标签" }), false).unwrap();
        assert_eq!(tag["name"], "AI 新标签");

        let comment = execute_tool(
            &conn,
            "add_task_comment",
            json!({ "taskId": created["id"], "content": "AI 评论" }),
            false,
        )
        .unwrap();
        assert_eq!(comment["content"], "AI 评论");

        let moved = execute_tool(
            &conn,
            "transition_task_status",
            json!({ "id": created["id"], "status": "in_progress" }),
            false,
        )
        .unwrap();
        assert_eq!(moved["status"], "in_progress");

        let due = execute_tool(&conn, "list_due_tasks", json!({ "withinDays": 7 }), false).unwrap();
        let found = due["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["title"] == "到期任务");
        assert!(found);

        let stats = execute_tool(&conn, "get_task_stats", json!({}), false).unwrap();
        assert!(stats["inProgress"].as_u64().unwrap() >= 1);
        assert!(stats["projects"].as_u64().unwrap() >= 1);
        assert!(stats["tags"].as_u64().unwrap() >= 1);

        let projects = execute_tool(&conn, "list_projects", json!({}), false).unwrap();
        assert!(projects["total"].as_u64().unwrap() >= 1);
        let tags = execute_tool(&conn, "list_tags", json!({}), false).unwrap();
        assert!(tags["total"].as_u64().unwrap() >= 1);
    }

    #[test]
    fn priority_enum_is_serializable() {
        let value = serde_json::to_value(Priority::High).unwrap();
        assert_eq!(value, json!("high"));
    }

    #[test]
    fn read_api_key_missing_file_returns_none() {
        let dir = std::env::temp_dir().join(format!(
            "task-manager-ai-key-missing-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let key = read_api_key(&dir).unwrap();
        assert!(key.is_none());
    }
}
