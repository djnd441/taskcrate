use crate::error::AppError;
use crate::models::{now_iso, BackupInfo, BackupSummary, SettingsPatch};
use crate::repositories;
use chrono::{DateTime, Utc};
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const BACKUP_PREFIX: &str = "task-manager-backup-";
const BACKUP_EXTENSION: &str = ".zip";
const MAX_BACKUPS: usize = 10;

pub fn backup_directory(data_dir: &Path) -> PathBuf {
    data_dir.join("backups")
}

pub fn create_backup(conn: &Connection, data_dir: &Path) -> Result<BackupInfo, AppError> {
    let dir = backup_directory(data_dir);
    fs::create_dir_all(&dir)?;

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let path = dir.join(format!("{BACKUP_PREFIX}{timestamp}{BACKUP_EXTENSION}"));

    crate::backup_zip::export_backup_zip(conn, data_dir, &path)?;
    prune_backups(&dir)?;

    let created_at = now_iso();
    repositories::update_settings(
        conn,
        SettingsPatch {
            last_backup_at: Some(Some(created_at.clone())),
            ..Default::default()
        },
    )?;

    let size_bytes = fs::metadata(&path)?.len();
    Ok(BackupInfo {
        path: path.display().to_string(),
        created_at,
        size_bytes,
    })
}

pub fn run_scheduled_backup(
    conn: &Connection,
    data_dir: &Path,
    interval_hours: i64,
) -> Result<(), AppError> {
    if interval_hours <= 0 {
        return Ok(());
    }
    let settings = repositories::get_settings(conn)?;
    let due = match settings.last_backup_at.as_deref() {
        None => true,
        Some(last) => {
            let Ok(last_time) = DateTime::parse_from_rfc3339(last) else {
                return Err(AppError::Backup("备份时间格式无效".to_string()));
            };
            let elapsed_hours = (Utc::now() - last_time.with_timezone(&Utc)).num_hours();
            elapsed_hours >= interval_hours
        }
    };
    if due {
        create_backup(conn, data_dir)?;
    }
    Ok(())
}

pub fn list_backups(data_dir: &Path) -> Result<Vec<BackupInfo>, AppError> {
    let dir = backup_directory(data_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with(BACKUP_PREFIX) || !name.ends_with(BACKUP_EXTENSION) {
            continue;
        }
        let created_at = fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(system_time_to_iso)
            .unwrap_or_else(now_iso);
        let size_bytes = fs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        backups.push(BackupInfo {
            path: path.display().to_string(),
            created_at,
            size_bytes,
        });
    }
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

pub fn backup_summary(conn: &Connection, data_dir: &Path) -> Result<BackupSummary, AppError> {
    let settings = repositories::get_settings(conn)?;
    Ok(BackupSummary {
        data_directory: data_dir.display().to_string(),
        backup_directory: backup_directory(data_dir).display().to_string(),
        last_backup_at: settings.last_backup_at,
        backups: list_backups(data_dir)?,
    })
}

fn prune_backups(dir: &Path) -> Result<(), AppError> {
    let mut files: Vec<_> = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned());
            name.as_deref()
                .is_some_and(|n| n.starts_with(BACKUP_PREFIX) && n.ends_with(BACKUP_EXTENSION))
        })
        .collect();
    files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH)
    });
    while files.len() > MAX_BACKUPS {
        if let Some(oldest) = files.first() {
            fs::remove_file(oldest)?;
        }
        files.remove(0);
    }
    Ok(())
}

fn system_time_to_iso(time: SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repositories;
    use uuid::Uuid;

    #[test]
    fn create_and_list_backups() {
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("task-manager.db");

        let result = (|| -> Result<(), AppError> {
            let conn = db::open_connection(&db_path)?;
            db::migrate(&conn)?;
            db::seed_defaults(&conn)?;
            let info = create_backup(&conn, &dir)?;
            assert!(info.size_bytes > 0);
            assert!(info.path.contains("task-manager-backup-"));
            let backups = list_backups(&dir)?;
            assert_eq!(backups.len(), 1);
            Ok(())
        })();

        drop(result);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scheduled_backup_respects_interval() {
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("task-manager.db");

        let result = (|| -> Result<(), AppError> {
            let conn = db::open_connection(&db_path)?;
            db::migrate(&conn)?;
            db::seed_defaults(&conn)?;
            run_scheduled_backup(&conn, &dir, 24)?;
            assert_eq!(list_backups(&dir)?.len(), 1);
            let settings = repositories::get_settings(&conn)?;
            assert!(settings.last_backup_at.is_some());
            run_scheduled_backup(&conn, &dir, 24)?;
            assert_eq!(list_backups(&dir)?.len(), 1);
            Ok(())
        })();

        drop(result);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
