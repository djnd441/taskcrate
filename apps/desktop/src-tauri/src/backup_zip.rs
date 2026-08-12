use crate::error::AppError;
use crate::models::{BackupPayload, ImportResult};
use crate::{attachments, library, transfer};
use rusqlite::Connection;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

fn sanitize_name(name: &str) -> String {
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
        "file".to_string()
    } else {
        sanitized
    }
}

fn read_entry(archive: &mut ZipArchive<File>, name: &str) -> Result<Vec<u8>, AppError> {
    let mut entry = archive
        .by_name(name)
        .map_err(|e| AppError::Backup(format!("备份文件缺少 {name}：{e}")))?;
    let mut bytes = Vec::new();
    entry
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::Backup(format!("读取备份文件失败：{e}")))?;
    Ok(bytes)
}

pub fn export_backup_zip(
    conn: &Connection,
    _data_dir: &Path,
    output_path: &Path,
) -> Result<ImportResult, AppError> {
    let payload = transfer::build_payload(conn)?;
    let file = File::create(output_path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let backup_json = serde_json::to_string_pretty(&payload)
        .map_err(|e| AppError::Backup(format!("备份数据序列化失败：{e}")))?;
    zip.start_file("backup.json", options)
        .map_err(|e| AppError::Backup(format!("备份写入失败：{e}")))?;
    zip.write_all(backup_json.as_bytes())
        .map_err(|e| AppError::Backup(format!("备份写入失败：{e}")))?;

    let mut attachment_entries = HashMap::new();
    let mut attachment_stmt =
        conn.prepare("SELECT id, task_id, name, storage_path FROM task_attachments")?;
    let attachment_rows = attachment_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    for row in attachment_rows {
        let (id, task_id, name, storage_path) = row?;
        let source = Path::new(&storage_path);
        if !source.is_file() {
            continue;
        }
        let entry = format!(
            "files/attachments/{}/{}_{}",
            task_id,
            id,
            sanitize_name(&name)
        );
        let mut bytes = Vec::new();
        File::open(source)?.read_to_end(&mut bytes)?;
        zip.start_file(&entry, options)
            .map_err(|e| AppError::Backup(format!("附件写入失败：{e}")))?;
        zip.write_all(&bytes)
            .map_err(|e| AppError::Backup(format!("附件写入失败：{e}")))?;
        attachment_entries.insert(id, entry);
    }

    let mut library_entries = HashMap::new();
    let mut library_stmt = conn.prepare("SELECT id, name, storage_path FROM library_resources")?;
    let library_rows = library_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in library_rows {
        let (id, name, storage_path) = row?;
        let source = Path::new(&storage_path);
        if !source.is_file() {
            continue;
        }
        let entry = format!("files/library/{}_{}", id, sanitize_name(&name));
        let mut bytes = Vec::new();
        File::open(source)?.read_to_end(&mut bytes)?;
        zip.start_file(&entry, options)
            .map_err(|e| AppError::Backup(format!("素材写入失败：{e}")))?;
        zip.write_all(&bytes)
            .map_err(|e| AppError::Backup(format!("素材写入失败：{e}")))?;
        library_entries.insert(id, entry);
    }

    let manifest = serde_json::json!({
        "attachments": attachment_entries,
        "library": library_entries,
    });
    zip.start_file("manifest.json", options)
        .map_err(|e| AppError::Backup(format!("备份清单写入失败：{e}")))?;
    zip.write_all(manifest.to_string().as_bytes())
        .map_err(|e| AppError::Backup(format!("备份清单写入失败：{e}")))?;

    zip.finish()
        .map_err(|e| AppError::Backup(format!("备份压缩失败：{e}")))?;

    Ok(ImportResult {
        projects: payload.projects.len(),
        tags: payload.tags.len(),
        tasks: payload.tasks.len(),
    })
}

pub fn restore_backup_zip(
    conn: &Connection,
    data_dir: &Path,
    backup_path: &Path,
    replace: bool,
) -> Result<ImportResult, AppError> {
    let file = File::open(backup_path)?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| AppError::Backup(format!("无法打开备份文件：{e}")))?;

    let backup_text = String::from_utf8(read_entry(&mut archive, "backup.json")?)
        .map_err(|e| AppError::Backup(format!("备份 JSON 编码无效：{e}")))?;
    let payload: BackupPayload = serde_json::from_str(&backup_text)
        .map_err(|e| AppError::Import(format!("备份 JSON 格式无效：{e}")))?;
    transfer::import_payload(conn, &payload, replace)?;

    let manifest_text = String::from_utf8(read_entry(&mut archive, "manifest.json")?)
        .map_err(|e| AppError::Backup(format!("备份清单编码无效：{e}")))?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_text)
        .map_err(|e| AppError::Backup(format!("备份清单格式无效：{e}")))?;

    for resource in &payload.library_resources {
        let Some(entry) = manifest["library"]
            .get(resource.id.as_str())
            .and_then(|value| value.as_str())
        else {
            continue;
        };
        let bytes = read_entry(&mut archive, entry)?;
        let dir = library::library_dir(data_dir);
        fs::create_dir_all(&dir)?;
        let file_name = format!("{}_{}", resource.id, sanitize_name(&resource.name));
        let target = dir.join(file_name);
        fs::write(&target, bytes)?;
        conn.execute(
            "INSERT OR REPLACE INTO library_resources
               (id, name, mime_type, kind, size_bytes, storage_path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                resource.id,
                resource.name,
                resource.mime_type,
                resource.kind,
                resource.size_bytes,
                target.display().to_string(),
                resource.created_at,
                resource.updated_at
            ],
        )?;
    }

    for attachment in &payload.attachments {
        let Some(entry) = manifest["attachments"]
            .get(attachment.id.as_str())
            .and_then(|value| value.as_str())
        else {
            continue;
        };
        let bytes = read_entry(&mut archive, entry)?;
        let dir = attachments::storage_dir(data_dir, &attachment.task_id);
        fs::create_dir_all(&dir)?;
        let file_name = format!("{}_{}", attachment.id, sanitize_name(&attachment.name));
        let target = dir.join(file_name);
        fs::write(&target, bytes)?;
        conn.execute(
            "INSERT OR REPLACE INTO task_attachments
               (id, task_id, name, mime_type, size_bytes, storage_path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                attachment.id,
                attachment.task_id,
                attachment.name,
                attachment.mime_type,
                attachment.size_bytes,
                target.display().to_string(),
                attachment.created_at,
                attachment.updated_at
            ],
        )?;
    }

    Ok(ImportResult {
        projects: payload.projects.len(),
        tags: payload.tags.len(),
        tasks: payload.tasks.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::{TaskCreateInput, TaskKind, TaskTemplateInput};
    use crate::{attachments, collaboration, library, repositories, templates};
    use uuid::Uuid;

    fn test_db() -> Connection {
        let conn = db::open_in_memory().expect("open in-memory db");
        db::migrate(&conn).expect("migrate");
        db::seed_defaults(&conn).expect("seed defaults");
        conn
    }

    #[test]
    fn full_backup_zip_roundtrip() {
        let conn = test_db();
        let dir = std::env::temp_dir().join(format!("taskcrate-full-backup-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let task = repositories::create_task(
            &conn,
            TaskCreateInput {
                title: "备份主任务".into(),
                ..Default::default()
            },
        )
        .unwrap();

        let attachment_source = dir.join("photo.png");
        fs::write(&attachment_source, b"image-data").unwrap();
        attachments::add_attachment(&conn, &dir, &task.id, attachment_source.to_str().unwrap())
            .unwrap();

        let library_source = dir.join("meeting.pdf");
        fs::write(&library_source, b"pdf-data").unwrap();
        library::add_library(&conn, &dir, library_source.to_str().unwrap()).unwrap();

        templates::create_task_template(
            &conn,
            TaskTemplateInput {
                name: "备份模板".into(),
                project_id: None,
                tasks: vec![TaskCreateInput {
                    title: "模板主任务".into(),
                    task_kind: TaskKind::Main,
                    ..Default::default()
                }],
            },
        )
        .unwrap();

        collaboration::add_task_comment(
            &conn,
            crate::models::TaskCommentInput {
                task_id: task.id.clone(),
                author: "测试".into(),
                content: "备份评论".into(),
            },
        )
        .unwrap();

        let backup_path = dir.join("full-backup.zip");
        let exported = export_backup_zip(&conn, &dir, &backup_path).unwrap();
        assert_eq!(exported.tasks, 1);

        let restored = test_db();
        let result = restore_backup_zip(&restored, &dir, &backup_path, true).unwrap();
        assert_eq!(result.tasks, 1);
        assert_eq!(
            attachments::list_all_attachments(&restored).unwrap().len(),
            1
        );
        assert_eq!(library::list_library(&restored).unwrap().len(), 1);
        assert_eq!(templates::list_task_templates(&restored).unwrap().len(), 1);
        assert_eq!(
            collaboration::list_all_task_comments(&restored)
                .unwrap()
                .len(),
            1
        );

        fs::remove_dir_all(&dir).unwrap();
    }
}
