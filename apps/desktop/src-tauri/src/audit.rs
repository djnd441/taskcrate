use crate::error::AppError;
use crate::models::{now_iso, AuditLog};
use rusqlite::{params, Connection, Row};
use uuid::Uuid;

fn audit_from_row(row: &Row<'_>) -> rusqlite::Result<AuditLog> {
    Ok(AuditLog {
        id: row.get("id")?,
        action: row.get("action")?,
        entity_type: row.get("entity_type")?,
        entity_id: row.get("entity_id")?,
        summary: row.get("summary")?,
        created_at: row.get("created_at")?,
    })
}

pub fn log_action(
    conn: &Connection,
    action: &str,
    entity_type: &str,
    entity_id: Option<&str>,
    summary: &str,
) -> Result<(), AppError> {
    let now = now_iso();
    conn.execute(
        "INSERT INTO audit_logs (id, action, entity_type, entity_id, summary, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            action,
            entity_type,
            entity_id,
            summary,
            now
        ],
    )?;
    Ok(())
}

pub fn list_audit_logs(conn: &Connection, limit: i64) -> Result<Vec<AuditLog>, AppError> {
    let limit = if limit <= 0 { 200 } else { limit.min(2000) };
    let mut stmt = conn.prepare(
        "SELECT id, action, entity_type, entity_id, summary, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT ?",
    )?;
    let rows = stmt.query_map(params![limit], audit_from_row)?;
    let mut logs = Vec::new();
    for row in rows {
        logs.push(row?);
    }
    Ok(logs)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn audit_log_roundtrip() {
        let conn = db::open_in_memory().unwrap();
        db::migrate(&conn).unwrap();
        log_action(&conn, "create", "task", Some("task-1"), "创建任务：测试").unwrap();
        log_action(&conn, "update", "task", Some("task-1"), "更新任务：测试").unwrap();

        let logs = list_audit_logs(&conn, 100).unwrap();
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].action, "update");
        assert_eq!(logs[0].summary, "更新任务：测试");
        assert!(logs[0].created_at >= logs[1].created_at);
    }
}
