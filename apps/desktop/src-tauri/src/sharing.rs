use crate::error::AppError;
use crate::models::{ExportResult, ImportResult, Task, TaskCreateInput, TaskResourceInput};
use crate::repositories;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareAttachment {
    id: String,
    #[serde(default)]
    task_share_index: usize,
    name: String,
    mime_type: String,
    size_bytes: u64,
    data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SharePayload {
    schema_version: u32,
    task: TaskCreateInput,
    attachments: Vec<ShareAttachment>,
}

pub fn export_share_task(
    conn: &Connection,
    task_id: &str,
    output_path: &str,
) -> Result<ExportResult, AppError> {
    let task = repositories::get_task(conn, task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
    let all = repositories::list_tasks(
        conn,
        crate::models::TaskFilter {
            include_archived: true,
            include_deleted: true,
            ..Default::default()
        },
        crate::models::TaskSort::default(),
        0,
        100_000,
    )?
    .items;
    let share_box = collect_share_box(&task, &all);
    let mut share_attachments = Vec::new();
    for (task_share_index, box_task) in share_box.iter().enumerate() {
        let attachments = crate::attachments::list_attachments(conn, &box_task.id)?;
        for attachment in &attachments {
            let storage_path: Option<String> = conn
                .query_row(
                    "SELECT storage_path FROM task_attachments WHERE id = ?",
                    rusqlite::params![attachment.id],
                    |row| row.get(0),
                )
                .ok();
            let Some(storage_path) = storage_path else {
                continue;
            };
            if let Ok(mut file) = fs::File::open(&storage_path) {
                let mut bytes = Vec::new();
                if file.read_to_end(&mut bytes).is_ok() {
                    share_attachments.push(ShareAttachment {
                        id: attachment.id.clone(),
                        task_share_index,
                        name: attachment.name.clone(),
                        mime_type: attachment.mime_type.clone(),
                        size_bytes: attachment.size_bytes,
                        data_base64: BASE64.encode(&bytes),
                    });
                }
            }
        }
    }
    let payload = SharePayload {
        schema_version: 1,
        task: task_to_create_input(&task, &all),
        attachments: share_attachments,
    };
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| AppError::Backup(format!("分享文件序列化失败：{e}")))?;
    fs::write(output_path, json)?;
    Ok(ExportResult {
        path: output_path.to_string(),
        count: 1,
        format: "task".to_string(),
    })
}

pub fn import_share_file(
    conn: &Connection,
    data_dir: &Path,
    file_path: &str,
    project_id: Option<String>,
) -> Result<ImportResult, AppError> {
    let text = fs::read_to_string(file_path)?;
    import_share_json_text(conn, data_dir, &text, project_id)
}

pub fn import_share_json_text(
    conn: &Connection,
    data_dir: &Path,
    text: &str,
    project_id: Option<String>,
) -> Result<ImportResult, AppError> {
    let mut payload: SharePayload = serde_json::from_str(text)
        .map_err(|e| AppError::Import(format!("分享文件格式无效：{e}")))?;
    if payload.task.title.trim().is_empty() {
        return Err(AppError::Import("任务标题不能为空".to_string()));
    }
    if let Some(project_id) = project_id {
        payload.task.project_id = Some(project_id);
    }
    let created = repositories::create_task(conn, payload.task)?;
    let all_after = repositories::list_tasks(
        conn,
        crate::models::TaskFilter {
            include_archived: true,
            include_deleted: true,
            ..Default::default()
        },
        crate::models::TaskSort::default(),
        0,
        100_000,
    )?
    .items;
    let created_box = collect_share_box(&created, &all_after);
    for attachment in payload.attachments {
        let owner = created_box
            .get(attachment.task_share_index)
            .ok_or_else(|| AppError::Import("分享附件所属任务不存在".to_string()))?;
        let bytes = BASE64
            .decode(attachment.data_base64.as_bytes())
            .map_err(|e| AppError::Import(format!("分享附件解码失败：{e}")))?;
        crate::attachments::add_attachment_bytes(
            conn,
            data_dir,
            &owner.id,
            &attachment.name,
            &attachment.mime_type,
            attachment.size_bytes,
            &bytes,
        )?;
    }
    Ok(ImportResult {
        projects: 0,
        tags: 0,
        tasks: 1,
    })
}

fn collect_share_box(task: &Task, tasks: &[Task]) -> Vec<Task> {
    let mut out = vec![task.clone()];
    let mut children: Vec<_> = tasks
        .iter()
        .filter(|item| item.parent_id.as_deref() == Some(task.id.as_str()))
        .collect();
    children.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then_with(|| a.created_at.cmp(&b.created_at))
    });
    for child in children {
        out.extend(collect_share_box(child, tasks));
    }
    out
}

fn task_to_create_input(task: &Task, tasks: &[Task]) -> TaskCreateInput {
    let children = tasks
        .iter()
        .filter(|item| item.parent_id.as_deref() == Some(task.id.as_str()))
        .enumerate()
        .map(|(index, child)| {
            let mut input = task_to_create_input(child, tasks);
            input.sort_order = index as i64;
            input
        })
        .collect();
    TaskCreateInput {
        title: task.title.clone(),
        notes: Some(task.notes.clone()),
        due_at: task.due_at.clone(),
        repeat_frequency: task.repeat_frequency,
        repeat_interval: task.repeat_interval,
        repeat_end_at: task.repeat_end_at.clone(),
        assignee: task.assignee.clone(),
        department: task.department.clone(),
        start_at: task.start_at.clone(),
        done_criteria: task.done_criteria.clone(),
        budget: task.budget.clone(),
        priority: task.priority,
        status: task.status,
        project_id: task.project_id.clone(),
        tag_ids: task.tag_ids.clone(),
        parent_id: None,
        task_kind: task.task_kind,
        resources: task
            .resources
            .iter()
            .map(|resource| TaskResourceInput {
                name: resource.name.clone(),
                kind: resource.kind,
                quantity: resource.quantity.clone(),
                unit: resource.unit.clone(),
                status: resource.status,
                notes: resource.notes.clone(),
                sort_order: resource.sort_order,
            })
            .collect(),
        children,
        sort_order: task.sort_order,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn test_db() -> Connection {
        let conn = db::open_in_memory().expect("open in-memory db");
        db::migrate(&conn).expect("migrate");
        db::seed_defaults(&conn).expect("seed defaults");
        conn
    }

    #[test]
    fn share_export_import_roundtrip_with_attachment() {
        let conn = test_db();
        let dir = std::env::temp_dir().join(format!(
            "task-manager-share-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("meeting.pdf");
        fs::write(&source, b"pdf-content").unwrap();

        let main = repositories::create_task(
            &conn,
            TaskCreateInput {
                title: "分享主任务".into(),
                task_kind: crate::models::TaskKind::Main,
                children: vec![TaskCreateInput {
                    title: "分享大任务".into(),
                    task_kind: crate::models::TaskKind::Major,
                    ..Default::default()
                }],
                ..Default::default()
            },
        )
        .unwrap();
        crate::attachments::add_attachment(&conn, &dir, &main.id, source.to_str().unwrap())
            .unwrap();
        let all = repositories::list_tasks(
            &conn,
            crate::models::TaskFilter::default(),
            crate::models::TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        let major = all
            .items
            .iter()
            .find(|task| task.task_kind == crate::models::TaskKind::Major)
            .unwrap();
        let child_source = dir.join("child.pdf");
        fs::write(&child_source, b"child-pdf").unwrap();
        crate::attachments::add_attachment(&conn, &dir, &major.id, child_source.to_str().unwrap())
            .unwrap();

        let path = dir.join("share.task");
        export_share_task(&conn, &main.id, path.to_str().unwrap()).unwrap();

        let restored = test_db();
        let result = import_share_file(&restored, &dir, path.to_str().unwrap(), None).unwrap();
        assert_eq!(result.tasks, 1);
        let all = repositories::list_tasks(
            &restored,
            crate::models::TaskFilter::default(),
            crate::models::TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(all.total, 2);
        let restored_attachments = crate::attachments::list_all_attachments(&restored).unwrap();
        assert_eq!(restored_attachments.len(), 2);
        assert!(restored_attachments
            .iter()
            .any(|item| item.name == "meeting.pdf"));
        assert!(restored_attachments
            .iter()
            .any(|item| item.name == "child.pdf"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
