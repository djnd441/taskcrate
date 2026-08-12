use crate::models::{
    AiChatMessage, AiChatResult, AiConnectionResult, AiConversation, AiConversationSummary,
    AiProvider, AuditLog, BackupInfo, BackupSummary, ExportResult, HealthInfo, ImportResult,
    LibraryResource, PackageResult, Priority, Project, ProjectCreateInput, ProjectMember,
    ProjectMemberInput, ProjectUpdateInput, Settings, SettingsPatch, Tag, TagCreateInput,
    TagUpdateInput, Task, TaskAttachment, TaskComment, TaskCommentInput, TaskCreateInput,
    TaskFilter, TaskPage, TaskSort, TaskStatus, TaskTemplate, TaskTemplateInput, TaskUpdateInput,
    UpdateStatus,
};
use crate::{
    ai, attachments, audit, backup, collaboration, library, notify, reminders, repositories,
    secrets, sharing, templates, transfer, AppState,
};
use rusqlite::Connection;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::MutexGuard;
use std::time::Duration;
use tauri::{Emitter, State};

type CmdResult<T> = Result<T, String>;

fn lock<'a>(state: &'a State<'_, AppState>) -> Result<MutexGuard<'a, Connection>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "数据库锁获取失败".to_string())
}

fn decorate_settings(data_dir: &std::path::Path, mut settings: Settings) -> Settings {
    settings.ai_api_key_configured = secrets::secret_configured(data_dir, secrets::AI_API_KEY);
    settings.webhook_ding_talk_configured =
        secrets::secret_configured(data_dir, secrets::WEBHOOK_DING_TALK);
    settings.webhook_we_com_configured =
        secrets::secret_configured(data_dir, secrets::WEBHOOK_WE_COM);
    settings.webhook_feishu_configured =
        secrets::secret_configured(data_dir, secrets::WEBHOOK_FEISHU);
    settings
}

fn save_webhook_setting(data_dir: &std::path::Path, name: &str, raw: &str) -> Result<(), String> {
    if raw.trim().is_empty() {
        secrets::delete_secret(data_dir, name).map_err(|e| e.to_string())
    } else {
        secrets::set_secret(data_dir, name, raw).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn health_check(state: State<AppState>) -> CmdResult<HealthInfo> {
    let conn = lock(&state)?;
    let schema_version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(HealthInfo {
        name: "TaskCrate".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        schema_version,
        data_dir: state.data_dir.display().to_string(),
    })
}

#[tauri::command]
pub fn play_reminder_sound() -> CmdResult<()> {
    reminders::play_reminder_sound();
    Ok(())
}

#[tauri::command]
pub fn set_scheduled_reminders(enabled: bool) -> CmdResult<String> {
    reminders::register_scheduled_reminders(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> CmdResult<Settings> {
    let conn = lock(&state)?;
    let settings = repositories::get_settings(&conn).map_err(|e| e.to_string())?;
    Ok(decorate_settings(&state.data_dir, settings))
}

#[tauri::command]
pub fn update_settings(state: State<AppState>, patch: SettingsPatch) -> CmdResult<Settings> {
    let conn = lock(&state)?;
    let mut repo_patch = patch.clone();
    if let Some(raw) = repo_patch.webhook_ding_talk.take() {
        save_webhook_setting(&state.data_dir, secrets::WEBHOOK_DING_TALK, &raw)?;
    }
    if let Some(raw) = repo_patch.webhook_we_com.take() {
        save_webhook_setting(&state.data_dir, secrets::WEBHOOK_WE_COM, &raw)?;
    }
    if let Some(raw) = repo_patch.webhook_feishu.take() {
        save_webhook_setting(&state.data_dir, secrets::WEBHOOK_FEISHU, &raw)?;
    }
    let settings = repositories::update_settings(&conn, repo_patch).map_err(|e| e.to_string())?;
    Ok(decorate_settings(&state.data_dir, settings))
}

#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    messages: Vec<AiChatMessage>,
    channel: tauri::ipc::Channel<crate::ai::AiStreamEvent>,
) -> CmdResult<AiChatResult> {
    let settings = {
        let conn = lock(&state)?;
        repositories::get_settings(&conn).map_err(|e| e.to_string())?
    };
    ai::chat(&state.data_dir, messages, &settings, &channel)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_execute_tool(
    state: State<AppState>,
    name: String,
    args: serde_json::Value,
    confirmed: bool,
) -> CmdResult<String> {
    let conn = lock(&state)?;
    let result = ai::execute_tool(&conn, &name, args, confirmed).map_err(|e| e.to_string())?;
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_test_connection(state: State<'_, AppState>) -> CmdResult<AiConnectionResult> {
    let settings = {
        let conn = lock(&state)?;
        repositories::get_settings(&conn).map_err(|e| e.to_string())?
    };
    ai::test_connection(&state.data_dir, &settings)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_get_config(state: State<AppState>) -> CmdResult<Settings> {
    let conn = lock(&state)?;
    let settings = repositories::get_settings(&conn).map_err(|e| e.to_string())?;
    Ok(decorate_settings(&state.data_dir, settings))
}

#[tauri::command]
pub fn ai_save_api_key(state: State<AppState>, api_key: String) -> CmdResult<bool> {
    ai::save_api_key(&state.data_dir, &api_key).map_err(|e| e.to_string())?;
    Ok(ai::api_key_configured(&state.data_dir))
}

#[tauri::command]
pub fn list_ai_conversations(state: State<AppState>) -> CmdResult<Vec<AiConversationSummary>> {
    let conn = lock(&state)?;
    ai::list_ai_conversations(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ai_conversation(
    state: State<AppState>,
    id: String,
) -> CmdResult<Option<AiConversation>> {
    let conn = lock(&state)?;
    ai::get_ai_conversation(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_ai_conversation(
    state: State<AppState>,
    provider: AiProvider,
    model: String,
) -> CmdResult<AiConversation> {
    let conn = lock(&state)?;
    ai::create_ai_conversation(&conn, provider, &model).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_ai_conversation(
    state: State<AppState>,
    conversation: AiConversation,
) -> CmdResult<AiConversation> {
    let conn = lock(&state)?;
    ai::save_ai_conversation(&conn, conversation).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_ai_conversation(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    ai::delete_ai_conversation(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_task_attachments(
    state: State<AppState>,
    task_id: String,
) -> CmdResult<Vec<TaskAttachment>> {
    let conn = lock(&state)?;
    attachments::list_attachments(&conn, &task_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn count_task_attachments(
    state: State<AppState>,
    task_ids: Vec<String>,
) -> CmdResult<HashMap<String, usize>> {
    let conn = lock(&state)?;
    attachments::count_attachments(&conn, &task_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_task_attachment(
    state: State<AppState>,
    task_id: String,
    source_path: String,
) -> CmdResult<TaskAttachment> {
    let conn = lock(&state)?;
    attachments::add_attachment(&conn, &state.data_dir, &task_id, &source_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_task_attachment(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    attachments::delete_attachment(&conn, &state.data_dir, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_library_resources(state: State<AppState>) -> CmdResult<Vec<LibraryResource>> {
    let conn = lock(&state)?;
    library::list_library(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_library_resource(
    state: State<AppState>,
    source_path: String,
) -> CmdResult<LibraryResource> {
    let conn = lock(&state)?;
    library::add_library(&conn, &state.data_dir, &source_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_library_resource(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    library::delete_library(&conn, &state.data_dir, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_library_resource_to_task(
    state: State<AppState>,
    library_id: String,
    task_id: String,
) -> CmdResult<TaskAttachment> {
    let conn = lock(&state)?;
    library::copy_library_to_task(&conn, &state.data_dir, &library_id, &task_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn package_task(
    state: State<AppState>,
    task_id: String,
    output_path: String,
) -> CmdResult<PackageResult> {
    let conn = lock(&state)?;
    attachments::package_task(&conn, &state.data_dir, &task_id, &output_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_share_task(
    state: State<AppState>,
    task_id: String,
    output_path: String,
) -> CmdResult<ExportResult> {
    let conn = lock(&state)?;
    sharing::export_share_task(&conn, &task_id, &output_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_share_file(
    state: State<AppState>,
    file_path: String,
    project_id: Option<String>,
) -> CmdResult<ImportResult> {
    let conn = lock(&state)?;
    sharing::import_share_file(&conn, &file_path, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_share_json_text(
    state: State<AppState>,
    json_text: String,
    project_id: Option<String>,
) -> CmdResult<ImportResult> {
    let conn = lock(&state)?;
    sharing::import_share_json_text(&conn, &json_text, project_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn list_projects(
    state: State<AppState>,
    include_archived: Option<bool>,
) -> CmdResult<Vec<Project>> {
    let conn = lock(&state)?;
    repositories::list_projects(&conn, include_archived.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_project(state: State<AppState>, id: String) -> CmdResult<Option<Project>> {
    let conn = lock(&state)?;
    repositories::get_project(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_project(state: State<AppState>, input: ProjectCreateInput) -> CmdResult<Project> {
    let conn = lock(&state)?;
    repositories::create_project(&conn, input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_project(
    state: State<AppState>,
    id: String,
    input: ProjectUpdateInput,
) -> CmdResult<Project> {
    let conn = lock(&state)?;
    repositories::update_project(&conn, &id, input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_project(state: State<AppState>, id: String) -> CmdResult<Project> {
    let conn = lock(&state)?;
    repositories::archive_project(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_project(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    repositories::delete_project(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_tags(state: State<AppState>) -> CmdResult<Vec<Tag>> {
    let conn = lock(&state)?;
    repositories::list_tags(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tag(state: State<AppState>, id: String) -> CmdResult<Option<Tag>> {
    let conn = lock(&state)?;
    repositories::get_tag(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_tag(state: State<AppState>, input: TagCreateInput) -> CmdResult<Tag> {
    let conn = lock(&state)?;
    repositories::create_tag(&conn, input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_tag(state: State<AppState>, id: String, input: TagUpdateInput) -> CmdResult<Tag> {
    let conn = lock(&state)?;
    repositories::update_tag(&conn, &id, input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_tag(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    repositories::delete_tag(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_audit_logs(state: State<AppState>, limit: Option<i64>) -> CmdResult<Vec<AuditLog>> {
    let conn = lock(&state)?;
    audit::list_audit_logs(&conn, limit.unwrap_or(200)).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn list_task_comments(state: State<AppState>, task_id: String) -> CmdResult<Vec<TaskComment>> {
    let conn = lock(&state)?;
    collaboration::list_task_comments(&conn, &task_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_task_comment(state: State<AppState>, input: TaskCommentInput) -> CmdResult<TaskComment> {
    let conn = lock(&state)?;
    let comment = collaboration::add_task_comment(&conn, input).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "comment",
        "task",
        Some(&comment.task_id),
        &format!("评论任务：{}", comment.author),
    );
    if notify::has_mention(&comment.content) {
        let targets = secrets::webhook_targets(&state.data_dir).unwrap_or_default();
        let _ = notify::send_webhook(
            &targets,
            "任务评论 @提醒",
            &format!("{}：{}", comment.author, comment.content),
        );
    }
    Ok(comment)
}

#[tauri::command]
pub fn delete_task_comment(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    collaboration::delete_task_comment(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_project_members(
    state: State<AppState>,
    project_id: String,
) -> CmdResult<Vec<ProjectMember>> {
    let conn = lock(&state)?;
    collaboration::list_project_members(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_project_member(
    state: State<AppState>,
    input: ProjectMemberInput,
) -> CmdResult<ProjectMember> {
    let conn = lock(&state)?;
    let member = collaboration::add_project_member(&conn, input).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "member_add",
        "project",
        Some(&member.project_id),
        &format!("添加项目成员：{}", member.name),
    );
    Ok(member)
}

#[tauri::command]
pub fn delete_project_member(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    collaboration::delete_project_member(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn send_test_notification(state: State<AppState>) -> CmdResult<String> {
    let targets = secrets::webhook_targets(&state.data_dir).map_err(|e| e.to_string())?;
    let count = notify::send_webhook(&targets, "通知测试", "TaskCrate 通知渠道测试成功")
        .map_err(|e| e.to_string())?;
    Ok(format!("已发送 {count} 个通知渠道"))
}
#[tauri::command]
pub fn list_task_templates(state: State<AppState>) -> CmdResult<Vec<TaskTemplate>> {
    let conn = lock(&state)?;
    templates::list_task_templates(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_task_template(state: State<AppState>, id: String) -> CmdResult<Option<TaskTemplate>> {
    let conn = lock(&state)?;
    templates::get_task_template(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_task_template(
    state: State<AppState>,
    input: TaskTemplateInput,
) -> CmdResult<TaskTemplate> {
    let conn = lock(&state)?;
    templates::create_task_template(&conn, input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_task_template(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    templates::delete_task_template(&conn, &id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn export_task_template_json(state: State<AppState>, template_id: String) -> CmdResult<String> {
    let conn = lock(&state)?;
    templates::export_task_template_json(&conn, &template_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_task_template_json(
    state: State<AppState>,
    json_text: String,
) -> CmdResult<TaskTemplate> {
    let conn = lock(&state)?;
    templates::import_task_template_json(&conn, &json_text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_task_template_file(
    state: State<AppState>,
    template_id: String,
    output_path: String,
) -> CmdResult<()> {
    let conn = lock(&state)?;
    templates::export_task_template_file(&conn, &template_id, &output_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_task_template_file(
    state: State<AppState>,
    file_path: String,
) -> CmdResult<TaskTemplate> {
    let conn = lock(&state)?;
    templates::import_task_template_file(&conn, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_capture_task(
    app: tauri::AppHandle,
    state: State<AppState>,
    title: String,
) -> CmdResult<Task> {
    let task = {
        let conn = lock(&state)?;
        repositories::create_task(
            &conn,
            TaskCreateInput {
                title,
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?
    };
    if let Ok(conn) = lock(&state) {
        let _ = audit::log_action(
            &conn,
            "create",
            "task",
            Some(&task.id),
            &format!("全局速记创建任务：{}", task.title),
        );
    }
    let _ = app.emit("taskcrate:data-changed", ());
    Ok(task)
}
#[tauri::command]
pub fn list_tasks(
    state: State<AppState>,
    filter: Option<TaskFilter>,
    sort: Option<TaskSort>,
    offset: Option<i64>,
    limit: Option<i64>,
) -> CmdResult<TaskPage> {
    let conn = lock(&state)?;
    repositories::list_tasks(
        &conn,
        filter.unwrap_or_default(),
        sort.unwrap_or_default(),
        offset.unwrap_or(0),
        limit.unwrap_or(100),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_task(state: State<AppState>, id: String) -> CmdResult<Option<Task>> {
    let conn = lock(&state)?;
    repositories::get_task(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_task(state: State<AppState>, input: TaskCreateInput) -> CmdResult<Task> {
    let conn = lock(&state)?;
    let task = repositories::create_task(&conn, input).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "create",
        "task",
        Some(&task.id),
        &format!("创建任务：{}", task.title),
    );
    Ok(task)
}

#[tauri::command]
pub fn update_task(state: State<AppState>, id: String, input: TaskUpdateInput) -> CmdResult<Task> {
    let conn = lock(&state)?;
    let task = repositories::update_task(&conn, &id, input).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "update",
        "task",
        Some(&task.id),
        &format!("更新任务：{}", task.title),
    );
    Ok(task)
}

#[tauri::command]
pub fn transition_task_status(
    state: State<AppState>,
    id: String,
    status: TaskStatus,
) -> CmdResult<Task> {
    let conn = lock(&state)?;
    let task =
        repositories::transition_task_status(&conn, &id, status).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "transition",
        "task",
        Some(&task.id),
        &format!("任务状态变更：{} → {}", task.title, status.as_str()),
    );
    Ok(task)
}

#[tauri::command]
pub fn archive_task(state: State<AppState>, id: String) -> CmdResult<Task> {
    let conn = lock(&state)?;
    let task = repositories::archive_task(&conn, &id).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "archive",
        "task",
        Some(&task.id),
        &format!("归档任务：{}", task.title),
    );
    Ok(task)
}

#[tauri::command]
pub fn unarchive_task(state: State<AppState>, id: String) -> CmdResult<Task> {
    let conn = lock(&state)?;
    let task = repositories::unarchive_task(&conn, &id).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "unarchive",
        "task",
        Some(&task.id),
        &format!("取消归档任务：{}", task.title),
    );
    Ok(task)
}

#[tauri::command]
pub fn soft_delete_task(state: State<AppState>, id: String) -> CmdResult<Task> {
    let conn = lock(&state)?;
    let task = repositories::soft_delete_task(&conn, &id).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "delete",
        "task",
        Some(&task.id),
        &format!("删除任务：{}", task.title),
    );
    Ok(task)
}

#[tauri::command]
pub fn restore_task(state: State<AppState>, id: String) -> CmdResult<Task> {
    let conn = lock(&state)?;
    let task = repositories::restore_task(&conn, &id).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "restore",
        "task",
        Some(&task.id),
        &format!("恢复任务：{}", task.title),
    );
    Ok(task)
}

#[tauri::command]
pub fn hard_delete_task(state: State<AppState>, id: String) -> CmdResult<()> {
    let conn = lock(&state)?;
    if let Ok(Some(task)) = repositories::get_task(&conn, &id) {
        let _ = audit::log_action(
            &conn,
            "hard_delete",
            "task",
            Some(&task.id),
            &format!("彻底删除任务：{}", task.title),
        );
    }
    repositories::hard_delete_task(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_due_reminders(
    state: State<AppState>,
    before: Option<String>,
    limit: Option<i64>,
) -> CmdResult<Vec<Task>> {
    let conn = lock(&state)?;
    repositories::list_due_reminders(
        &conn,
        &before.unwrap_or_else(crate::models::now_iso),
        limit.unwrap_or(100),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn batch_complete_tasks(state: State<AppState>, ids: Vec<String>) -> CmdResult<usize> {
    let conn = lock(&state)?;
    let count = repositories::batch_complete_tasks(&conn, &ids).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "batch_complete",
        "task",
        None,
        &format!("批量完成 {} 项任务", count),
    );
    Ok(count)
}

#[tauri::command]
pub fn batch_soft_delete_tasks(state: State<AppState>, ids: Vec<String>) -> CmdResult<usize> {
    let conn = lock(&state)?;
    let count = repositories::batch_soft_delete_tasks(&conn, &ids).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "batch_delete",
        "task",
        None,
        &format!("批量删除 {} 项任务", count),
    );
    Ok(count)
}

#[tauri::command]
pub fn batch_restore_tasks(state: State<AppState>, ids: Vec<String>) -> CmdResult<usize> {
    let conn = lock(&state)?;
    let count = repositories::batch_restore_tasks(&conn, &ids).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "batch_restore",
        "task",
        None,
        &format!("批量恢复 {} 项任务", count),
    );
    Ok(count)
}

#[tauri::command]
pub fn batch_hard_delete_tasks(state: State<AppState>, ids: Vec<String>) -> CmdResult<usize> {
    let conn = lock(&state)?;
    let count = repositories::batch_hard_delete_tasks(&conn, &ids).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "batch_hard_delete",
        "task",
        None,
        &format!("批量彻底删除 {} 项任务", count),
    );
    Ok(count)
}

#[tauri::command]
pub fn clear_trash(state: State<AppState>) -> CmdResult<usize> {
    let conn = lock(&state)?;
    let count = repositories::clear_trash(&conn).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "clear_trash",
        "task",
        None,
        &format!("清空回收站 {} 项任务", count),
    );
    Ok(count)
}

#[tauri::command]
pub fn batch_set_priority(
    state: State<AppState>,
    ids: Vec<String>,
    priority: Priority,
) -> CmdResult<usize> {
    let conn = lock(&state)?;
    let count =
        repositories::batch_set_priority(&conn, &ids, priority).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "batch_priority",
        "task",
        None,
        &format!("批量修改优先级 {} 项任务", count),
    );
    Ok(count)
}

#[tauri::command]
pub fn batch_set_project(
    state: State<AppState>,
    ids: Vec<String>,
    project_id: Option<String>,
) -> CmdResult<usize> {
    let conn = lock(&state)?;
    let count =
        repositories::batch_set_project(&conn, &ids, project_id).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "batch_project",
        "task",
        None,
        &format!("批量移动项目 {} 项任务", count),
    );
    Ok(count)
}

#[tauri::command]
pub fn batch_add_tags(
    state: State<AppState>,
    ids: Vec<String>,
    tag_ids: Vec<String>,
) -> CmdResult<usize> {
    let conn = lock(&state)?;
    let count = repositories::batch_add_tags(&conn, &ids, &tag_ids).map_err(|e| e.to_string())?;
    let _ = audit::log_action(
        &conn,
        "batch_tags",
        "task",
        None,
        &format!("批量添加标签 {} 项任务", count),
    );
    Ok(count)
}

#[tauri::command]
pub fn backup_now(state: State<AppState>) -> CmdResult<BackupInfo> {
    let conn = lock(&state)?;
    backup::create_backup(&conn, &state.data_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_backup(
    state: State<AppState>,
    backup_path: String,
    replace: bool,
) -> CmdResult<ImportResult> {
    let conn = lock(&state)?;
    crate::backup_zip::restore_backup_zip(
        &conn,
        &state.data_dir,
        std::path::Path::new(&backup_path),
        replace,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_backups(state: State<AppState>) -> CmdResult<BackupSummary> {
    let conn = lock(&state)?;
    backup::backup_summary(&conn, &state.data_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_json(state: State<AppState>, file_path: String) -> CmdResult<ExportResult> {
    let conn = lock(&state)?;
    transfer::export_json(&conn, std::path::Path::new(&file_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_excel(state: State<AppState>, file_path: String) -> CmdResult<ExportResult> {
    let conn = lock(&state)?;
    transfer::export_excel(&conn, std::path::Path::new(&file_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_excel(state: State<AppState>, file_path: String) -> CmdResult<ImportResult> {
    let conn = lock(&state)?;
    transfer::import_excel(&conn, std::path::Path::new(&file_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_csv(state: State<AppState>, file_path: String) -> CmdResult<ImportResult> {
    let conn = lock(&state)?;
    transfer::import_csv(&conn, std::path::Path::new(&file_path)).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn export_csv(state: State<AppState>, file_path: String) -> CmdResult<ExportResult> {
    let conn = lock(&state)?;
    transfer::export_csv(&conn, std::path::Path::new(&file_path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_json(
    state: State<AppState>,
    file_path: String,
    replace: bool,
) -> CmdResult<ImportResult> {
    let conn = lock(&state)?;
    transfer::import_json(&conn, std::path::Path::new(&file_path), replace)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_json_text(
    state: State<AppState>,
    json_text: String,
    replace: bool,
) -> CmdResult<ImportResult> {
    let conn = lock(&state)?;
    transfer::import_json_text(&conn, &json_text, replace).map_err(|e| e.to_string())
}

fn parse_version(version: &str) -> Vec<u32> {
    version
        .trim_start_matches('v')
        .split('.')
        .filter_map(|part| part.parse::<u32>().ok())
        .collect()
}

fn version_gt(left: &str, right: &str) -> bool {
    let left = parse_version(left);
    let right = parse_version(right);
    for index in 0..left.len().max(right.len()) {
        let left_part = left.get(index).copied().unwrap_or(0);
        let right_part = right.get(index).copied().unwrap_or(0);
        if left_part != right_part {
            return left_part > right_part;
        }
    }
    false
}

#[derive(Debug, Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    assets: Vec<GithubReleaseAsset>,
}

async fn fetch_latest_release() -> Result<Option<GithubRelease>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| format!("初始化网络客户端失败：{error}"))?;
    let response = client
        .get("https://api.github.com/repos/djnd441/taskcrate/releases/latest")
        .header("User-Agent", "TaskCrate")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("无法连接 GitHub：{error}"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("GitHub 接口返回异常：{}", response.status()));
    }
    response
        .json::<GithubRelease>()
        .await
        .map(Some)
        .map_err(|error| format!("解析 Release 信息失败：{error}"))
}

#[tauri::command]
pub async fn check_update() -> CmdResult<UpdateStatus> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let checked_at = crate::models::now_iso();
    if let Some(update_url) = std::env::var("TASK_MANAGER_UPDATE_URL").ok() {
        return Ok(UpdateStatus {
            current_version,
            latest_version: None,
            has_update: false,
            update_url: Some(update_url),
            release_url: None,
            release_name: None,
            release_notes: None,
            published_at: None,
            checked_at,
            message: "已使用自定义更新源，当前为最新已知版本".to_string(),
        });
    }
    let release = match fetch_latest_release().await {
        Ok(Some(release)) => release,
        Ok(None) => {
            return Ok(UpdateStatus {
                current_version,
                latest_version: None,
                has_update: false,
                update_url: None,
                release_url: None,
                release_name: None,
                release_notes: None,
                published_at: None,
                checked_at,
                message: "GitHub 暂无可用 Release".to_string(),
            });
        }
        Err(error) => return Err(format!("检查更新失败：{error}")),
    };
    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let has_update = version_gt(&latest_version, &current_version);
    let download_url = release
        .assets
        .iter()
        .find(|asset| {
            let name = asset.name.to_ascii_lowercase();
            name.ends_with("-setup.exe")
                || name.ends_with("_setup.exe")
                || name.ends_with("setup.exe")
        })
        .map(|asset| asset.browser_download_url.clone());
    let update_url = download_url.or_else(|| Some(release.html_url.clone()));
    Ok(UpdateStatus {
        current_version,
        latest_version: Some(latest_version.clone()),
        has_update,
        update_url,
        release_url: Some(release.html_url),
        release_name: release.name,
        release_notes: release.body,
        published_at: release.published_at,
        checked_at,
        message: if has_update {
            format!("发现新版本 v{latest_version}")
        } else {
            "当前已是最新版本".to_string()
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_compare_handles_v_prefix_and_multi_digit() {
        assert!(version_gt("0.2.0", "0.1.9"));
        assert!(version_gt("v0.10.0", "v0.9.9"));
        assert!(!version_gt("0.1.0", "0.1.0"));
        assert!(!version_gt("0.1.0", "0.1.1"));
    }
}
