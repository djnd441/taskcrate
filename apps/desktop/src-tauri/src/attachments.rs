use crate::error::AppError;
use crate::models::{now_iso, PackageResult, TaskAttachment};
use crate::repositories;
use rusqlite::{Connection, OptionalExtension};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

pub fn storage_dir(data_dir: &Path, task_id: &str) -> PathBuf {
    data_dir.join("attachments").join(task_id)
}

fn safe_file_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if sanitized.is_empty() {
        "attachment".to_string()
    } else {
        sanitized
    }
}

pub fn list_attachments(conn: &Connection, task_id: &str) -> Result<Vec<TaskAttachment>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, name, mime_type, size_bytes, created_at, updated_at
         FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(rusqlite::params![task_id], |row| {
        Ok(TaskAttachment {
            id: row.get("id")?,
            task_id: row.get("task_id")?,
            name: row.get("name")?,
            mime_type: row.get("mime_type")?,
            size_bytes: row.get("size_bytes")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    })?;
    let mut attachments = Vec::new();
    for row in rows {
        attachments.push(row?);
    }
    Ok(attachments)
}

pub fn list_all_attachments(conn: &Connection) -> Result<Vec<TaskAttachment>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, name, mime_type, size_bytes, created_at, updated_at
         FROM task_attachments ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TaskAttachment {
            id: row.get("id")?,
            task_id: row.get("task_id")?,
            name: row.get("name")?,
            mime_type: row.get("mime_type")?,
            size_bytes: row.get("size_bytes")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    })?;
    let mut attachments = Vec::new();
    for row in rows {
        attachments.push(row?);
    }
    Ok(attachments)
}

pub fn count_attachments(
    conn: &Connection,
    task_ids: &[String],
) -> Result<HashMap<String, usize>, AppError> {
    if task_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = (0..task_ids.len())
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT task_id, COUNT(*) FROM task_attachments
         WHERE task_id IN ({placeholders}) GROUP BY task_id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let params = rusqlite::params_from_iter(task_ids.iter());
    let rows = stmt.query_map(params, |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as usize))
    })?;
    let mut counts = HashMap::new();
    for row in rows {
        let (task_id, count) = row?;
        counts.insert(task_id, count);
    }
    Ok(counts)
}

pub fn add_attachment(
    conn: &Connection,
    data_dir: &Path,
    task_id: &str,
    source_path: &str,
) -> Result<TaskAttachment, AppError> {
    if repositories::get_task(conn, task_id)?.is_none() {
        return Err(AppError::TaskNotFound(task_id.to_string()));
    }
    let source = Path::new(source_path);
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("attachment")
        .to_string();
    let size_bytes = fs::metadata(source)?.len();
    let dir = storage_dir(data_dir, task_id);
    fs::create_dir_all(&dir)?;
    let target = dir.join(format!("{}-{}", Uuid::new_v4(), safe_file_name(&file_name)));
    fs::copy(source, &target)?;

    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO task_attachments
           (id, task_id, name, mime_type, size_bytes, storage_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, '', ?4, ?5, ?6, ?6)",
        rusqlite::params![
            id,
            task_id,
            file_name,
            size_bytes,
            target.display().to_string(),
            now
        ],
    )?;
    get_attachment(conn, &id)?.ok_or_else(|| AppError::Validation("附件创建失败".to_string()))
}

pub fn delete_attachment(conn: &Connection, data_dir: &Path, id: &str) -> Result<(), AppError> {
    let storage_path: Option<String> = conn
        .query_row(
            "SELECT storage_path FROM task_attachments WHERE id = ?",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(storage_path) = storage_path {
        conn.execute(
            "DELETE FROM task_attachments WHERE id = ?",
            rusqlite::params![id],
        )?;
        let _ = fs::remove_file(Path::new(&storage_path));
        let _ = fs::remove_dir(data_dir.join("attachments"));
    }
    Ok(())
}

pub fn package_task(
    conn: &Connection,
    _data_dir: &Path,
    task_id: &str,
    output_path: &str,
) -> Result<PackageResult, AppError> {
    let task = repositories::get_task(conn, task_id)?
        .ok_or_else(|| AppError::TaskNotFound(task_id.to_string()))?;
    let attachments = list_attachments(conn, task_id)?;
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
    let box_tasks: Vec<_> = all
        .iter()
        .filter(|item| item.id == task.id || is_descendant(item, &all, &task.id))
        .cloned()
        .collect();

    let file = fs::File::create(output_path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for attachment in &attachments {
        let stored_path: Option<String> = conn
            .query_row(
                "SELECT storage_path FROM task_attachments WHERE id = ?",
                rusqlite::params![attachment.id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(stored_path) = stored_path else {
            continue;
        };
        let source = Path::new(&stored_path);
        if let Ok(mut file) = fs::File::open(&source) {
            let mut bytes = Vec::new();
            if file.read_to_end(&mut bytes).is_ok() {
                zip.start_file(format!("附件/{}", attachment.name), options)
                    .map_err(|e| AppError::Backup(format!("打包失败：{e}")))?;
                zip.write_all(&bytes)
                    .map_err(|e| AppError::Backup(format!("打包失败：{e}")))?;
            }
        }
    }

    let markdown = build_task_markdown(&task, &box_tasks, &attachments);
    zip.start_file("任务清单.md", options)
        .map_err(|e| AppError::Backup(format!("打包失败：{e}")))?;
    zip.write_all(markdown.as_bytes())
        .map_err(|e| AppError::Backup(format!("打包失败：{e}")))?;

    let json = serde_json::to_string_pretty(&serde_json::json!({
        "task": task,
        "boxTasks": box_tasks,
        "attachments": attachments
    }))
    .map_err(|e| AppError::Backup(format!("打包数据序列化失败：{e}")))?;
    zip.start_file("任务数据.json", options)
        .map_err(|e| AppError::Backup(format!("打包失败：{e}")))?;
    zip.write_all(json.as_bytes())
        .map_err(|e| AppError::Backup(format!("打包失败：{e}")))?;
    zip.finish()
        .map_err(|e| AppError::Backup(format!("打包失败：{e}")))?;

    Ok(PackageResult {
        path: output_path.to_string(),
        count: attachments.len(),
    })
}

fn get_attachment(conn: &Connection, id: &str) -> Result<Option<TaskAttachment>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, name, mime_type, size_bytes, created_at, updated_at
         FROM task_attachments WHERE id = ?",
    )?;
    Ok(stmt
        .query_row(rusqlite::params![id], |row| {
            Ok(TaskAttachment {
                id: row.get("id")?,
                task_id: row.get("task_id")?,
                name: row.get("name")?,
                mime_type: row.get("mime_type")?,
                size_bytes: row.get("size_bytes")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })
        .optional()?)
}

fn is_descendant(task: &crate::models::Task, tasks: &[crate::models::Task], root_id: &str) -> bool {
    let mut current = task;
    while let Some(parent_id) = &current.parent_id {
        if parent_id == root_id {
            return true;
        }
        let Some(parent) = tasks.iter().find(|item| &item.id == parent_id) else {
            return false;
        };
        current = parent;
    }
    false
}

fn build_task_markdown(
    task: &crate::models::Task,
    box_tasks: &[crate::models::Task],
    attachments: &[TaskAttachment],
) -> String {
    let mut markdown = format!("# {}\n\n", task.title);
    markdown.push_str(&format!("- 状态：{}\n", task.status.as_str()));
    markdown.push_str(&format!("- 优先级：{}\n", task.priority.as_str()));
    if !task.notes.is_empty() {
        markdown.push_str(&format!("- 备注：{}\n", task.notes));
    }
    markdown.push_str("\n## 任务拆解\n");
    let children: Vec<_> = box_tasks
        .iter()
        .filter(|item| item.parent_id.as_deref() == Some(task.id.as_str()))
        .collect();
    for child in children {
        markdown.push_str(&format!(
            "- {}：{}\n",
            child.task_kind.as_str(),
            child.title
        ));
        let grandchildren: Vec<_> = box_tasks
            .iter()
            .filter(|item| item.parent_id.as_deref() == Some(child.id.as_str()))
            .collect();
        for grandchild in grandchildren {
            markdown.push_str(&format!(
                "  - {}：{}\n",
                grandchild.task_kind.as_str(),
                grandchild.title
            ));
        }
    }
    markdown.push_str("\n## 工具与资源\n");
    for resource in &task.resources {
        markdown.push_str(&format!(
            "- {}（{}）\n",
            resource.name,
            resource.status.as_str()
        ));
    }
    markdown.push_str("\n## 附件\n");
    for attachment in attachments {
        markdown.push_str(&format!("- {}\n", attachment.name));
    }
    markdown
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repositories;

    fn test_db() -> Connection {
        let conn = db::open_in_memory().expect("open in-memory db");
        db::migrate(&conn).expect("migrate");
        db::seed_defaults(&conn).expect("seed defaults");
        conn
    }

    #[test]
    fn attachment_crud_and_package() {
        let conn = test_db();
        let dir = std::env::temp_dir().join(format!(
            "task-manager-attachments-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("meeting.pdf");
        fs::write(&source, b"pdf-content").unwrap();

        let task = repositories::create_task(
            &conn,
            crate::models::TaskCreateInput {
                title: "会议任务".into(),
                ..Default::default()
            },
        )
        .unwrap();
        let attachment = add_attachment(&conn, &dir, &task.id, source.to_str().unwrap()).unwrap();
        assert_eq!(attachment.name, "meeting.pdf");
        assert_eq!(list_attachments(&conn, &task.id).unwrap().len(), 1);

        let output = dir.join("box.zip");
        let result = package_task(&conn, &dir, &task.id, output.to_str().unwrap()).unwrap();
        assert_eq!(result.count, 1);
        assert!(output.exists());

        delete_attachment(&conn, &dir, &attachment.id).unwrap();
        assert!(list_attachments(&conn, &task.id).unwrap().is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }
}
