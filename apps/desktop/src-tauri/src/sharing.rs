use crate::error::AppError;
use crate::models::{
    ExportResult, ImportResult, Task, TaskAttachment, TaskCreateInput, TaskResourceInput,
};
use crate::repositories;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SharePayload {
    schema_version: u32,
    task: TaskCreateInput,
    attachments: Vec<TaskAttachment>,
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
    let attachments = crate::attachments::list_attachments(conn, task_id)?;
    let payload = SharePayload {
        schema_version: 1,
        task: task_to_create_input(&task, &all),
        attachments,
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
    file_path: &str,
    project_id: Option<String>,
) -> Result<ImportResult, AppError> {
    let text = fs::read_to_string(file_path)?;
    import_share_json_text(conn, &text, project_id)
}

pub fn import_share_json_text(
    conn: &Connection,
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
    let _ = repositories::create_task(conn, payload.task)?;
    Ok(ImportResult {
        projects: 0,
        tags: 0,
        tasks: 1,
    })
}

fn task_to_create_input(task: &Task, tasks: &[Task]) -> TaskCreateInput {
    let children = tasks
        .iter()
        .filter(|item| item.parent_id.as_deref() == Some(task.id.as_str()))
        .map(|child| task_to_create_input(child, tasks))
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
    fn share_export_import_roundtrip() {
        let conn = test_db();
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

        let dir = std::env::temp_dir().join(format!(
            "task-manager-share-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("share.task");
        export_share_task(&conn, &main.id, path.to_str().unwrap()).unwrap();

        let restored = test_db();
        let result = import_share_file(&restored, path.to_str().unwrap(), None).unwrap();
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
        fs::remove_dir_all(&dir).unwrap();
    }
}
