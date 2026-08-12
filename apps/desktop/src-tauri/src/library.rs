use crate::error::AppError;
use crate::models::{now_iso, LibraryResource, TaskAttachment};
use crate::{attachments, repositories};
use rusqlite::{Connection, OptionalExtension};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub fn library_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("library")
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
        "resource".to_string()
    } else {
        sanitized
    }
}

fn kind_for_name(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".bmp")
    {
        "image"
    } else if lower.ends_with(".mp4")
        || lower.ends_with(".mov")
        || lower.ends_with(".avi")
        || lower.ends_with(".mkv")
    {
        "video"
    } else if lower.ends_with(".mp3")
        || lower.ends_with(".wav")
        || lower.ends_with(".flac")
        || lower.ends_with(".m4a")
    {
        "audio"
    } else if lower.ends_with(".pdf")
        || lower.ends_with(".doc")
        || lower.ends_with(".docx")
        || lower.ends_with(".xls")
        || lower.ends_with(".xlsx")
        || lower.ends_with(".ppt")
        || lower.ends_with(".pptx")
        || lower.ends_with(".txt")
        || lower.ends_with(".md")
    {
        "document"
    } else {
        "other"
    }
}

pub fn list_library(conn: &Connection) -> Result<Vec<LibraryResource>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, mime_type, kind, size_bytes, storage_path, created_at, updated_at
         FROM library_resources ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(LibraryResource {
            id: row.get("id")?,
            name: row.get("name")?,
            mime_type: row.get("mime_type")?,
            kind: row.get("kind")?,
            size_bytes: row.get("size_bytes")?,
            storage_path: row.get("storage_path")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    })?;
    let mut resources = Vec::new();
    for row in rows {
        resources.push(row?);
    }
    Ok(resources)
}

pub fn add_library(
    conn: &Connection,
    data_dir: &Path,
    source_path: &str,
) -> Result<LibraryResource, AppError> {
    let source = Path::new(source_path);
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("resource")
        .to_string();
    let size_bytes = fs::metadata(source)?.len();
    let dir = library_dir(data_dir);
    fs::create_dir_all(&dir)?;
    let target = dir.join(format!("{}-{}", Uuid::new_v4(), safe_file_name(&file_name)));
    fs::copy(source, &target)?;

    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO library_resources
           (id, name, mime_type, kind, size_bytes, storage_path, created_at, updated_at)
         VALUES (?1, ?2, '', ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![
            id,
            file_name,
            kind_for_name(&file_name),
            size_bytes,
            target.display().to_string(),
            now
        ],
    )?;
    get_library(conn, &id)?.ok_or_else(|| AppError::Validation("素材保存失败".to_string()))
}

pub fn delete_library(conn: &Connection, _data_dir: &Path, id: &str) -> Result<(), AppError> {
    let storage_path: Option<String> = conn
        .query_row(
            "SELECT storage_path FROM library_resources WHERE id = ?",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(storage_path) = storage_path {
        conn.execute(
            "DELETE FROM library_resources WHERE id = ?",
            rusqlite::params![id],
        )?;
        let _ = fs::remove_file(Path::new(&storage_path));
    }
    Ok(())
}

pub fn copy_library_to_task(
    conn: &Connection,
    data_dir: &Path,
    library_id: &str,
    task_id: &str,
) -> Result<TaskAttachment, AppError> {
    if repositories::get_task(conn, task_id)?.is_none() {
        return Err(AppError::TaskNotFound(task_id.to_string()));
    }
    let storage_path: Option<String> = conn
        .query_row(
            "SELECT storage_path FROM library_resources WHERE id = ?",
            rusqlite::params![library_id],
            |row| row.get(0),
        )
        .optional()?;
    let Some(storage_path) = storage_path else {
        return Err(AppError::Validation("素材不存在".to_string()));
    };
    attachments::add_attachment(conn, data_dir, task_id, &storage_path)
}

fn get_library(conn: &Connection, id: &str) -> Result<Option<LibraryResource>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, mime_type, kind, size_bytes, storage_path, created_at, updated_at
         FROM library_resources WHERE id = ?",
    )?;
    Ok(stmt
        .query_row(rusqlite::params![id], |row| {
            Ok(LibraryResource {
                id: row.get("id")?,
                name: row.get("name")?,
                mime_type: row.get("mime_type")?,
                kind: row.get("kind")?,
                size_bytes: row.get("size_bytes")?,
                storage_path: row.get("storage_path")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })
        .optional()?)
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
    fn library_crud_and_copy_to_task() {
        let conn = test_db();
        let dir = std::env::temp_dir().join(format!(
            "task-manager-library-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("photo.png");
        fs::write(&source, b"image-data").unwrap();

        let resource = add_library(&conn, &dir, source.to_str().unwrap()).unwrap();
        assert_eq!(resource.name, "photo.png");
        assert_eq!(resource.kind, "image");
        assert_eq!(list_library(&conn).unwrap().len(), 1);

        let task = repositories::create_task(
            &conn,
            crate::models::TaskCreateInput {
                title: "素材任务".into(),
                ..Default::default()
            },
        )
        .unwrap();
        let attachment = copy_library_to_task(&conn, &dir, &resource.id, &task.id).unwrap();
        assert!(attachment.name.ends_with("photo.png"));

        delete_library(&conn, &dir, &resource.id).unwrap();
        assert!(list_library(&conn).unwrap().is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }
}
