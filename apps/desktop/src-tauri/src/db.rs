use crate::error::AppError;
use crate::models::now_iso;
use rusqlite::Connection;
use std::path::Path;

pub const SCHEMA_VERSION: i64 = 10;

struct Migration {
    version: i64,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        sql: V1_SCHEMA,
    },
    Migration {
        version: 2,
        sql: V2_SCHEMA,
    },
    Migration {
        version: 3,
        sql: V3_SCHEMA,
    },
    Migration {
        version: 4,
        sql: V4_SCHEMA,
    },
    Migration {
        version: 5,
        sql: V5_SCHEMA,
    },
    Migration {
        version: 6,
        sql: V6_SCHEMA,
    },
    Migration {
        version: 7,
        sql: V7_SCHEMA,
    },
    Migration {
        version: 8,
        sql: V8_SCHEMA,
    },
    Migration {
        version: 9,
        sql: V9_SCHEMA,
    },
    Migration {
        version: 10,
        sql: V10_SCHEMA,
    },
];

const V1_SCHEMA: &str = r#"
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  priority TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'todo',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  CHECK (priority IN ('none','low','medium','high','urgent')),
  CHECK (status IN ('todo','in_progress','completed','cancelled'))
);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX idx_tasks_archived_at ON tasks(archived_at);
"#;

const V2_SCHEMA: &str = r#"
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
"#;

const V3_SCHEMA: &str = r#"
ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN task_kind TEXT NOT NULL DEFAULT 'main';
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_kind ON tasks(task_kind);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'tool',
  quantity TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (kind IN ('tool','material','people','budget','other')),
  CHECK (status IN ('pending','ready','in_use','done'))
);
CREATE INDEX IF NOT EXISTS idx_resources_task_id ON resources(task_id, sort_order);
"#;

const V4_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '新对话',
  provider TEXT NOT NULL DEFAULT 'off',
  model TEXT NOT NULL DEFAULT '',
  messages TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated_at ON ai_conversations(updated_at);
"#;

const V5_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS task_attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id, created_at);
"#;

const V6_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS reminder_events (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  reminded_at TEXT NOT NULL
);
"#;

const V7_SCHEMA: &str = r#"
ALTER TABLE tasks ADD COLUMN repeat_frequency TEXT NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN repeat_interval INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN repeat_end_at TEXT;

CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  tasks_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_templates_updated_at ON task_templates(updated_at);
"#;
const V8_SCHEMA: &str = r#"
ALTER TABLE tasks ADD COLUMN assignee TEXT;
ALTER TABLE tasks ADD COLUMN department TEXT;
ALTER TABLE tasks ADD COLUMN start_at TEXT;
ALTER TABLE tasks ADD COLUMN done_criteria TEXT;
ALTER TABLE tasks ADD COLUMN budget TEXT;

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
"#;
const V9_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id, created_at);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL,
  CHECK (role IN ('viewer','editor','admin'))
);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id, name);
"#;
const V10_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS library_resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'other',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (kind IN ('document','image','video','audio','other'))
);
CREATE INDEX IF NOT EXISTS idx_library_resources_created_at ON library_resources(created_at);
"#;
pub fn open_connection(path: &Path) -> Result<Connection, AppError> {
    let conn = Connection::open(path)?;
    configure(&conn)?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> Result<Connection, AppError> {
    let conn = Connection::open_in_memory()?;
    configure(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         PRAGMA busy_timeout=5000;",
    )?;
    Ok(())
}

pub fn migrate(conn: &Connection) -> Result<(), AppError> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for migration in MIGRATIONS.iter().filter(|m| m.version > current) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
    }
    Ok(())
}

pub fn seed_defaults(conn: &Connection) -> Result<(), AppError> {
    let now = now_iso();
    conn.execute_batch(&format!(
        r#"
        INSERT OR IGNORE INTO projects (id, name, color, sort_order, is_archived, created_at, updated_at) VALUES
          ('00000000-0000-4000-8000-000000000001', '收件箱', '#6B7280', 0, 0, '{now}', '{now}'),
          ('00000000-0000-4000-8000-000000000002', '工作', '#4F6EF7', 1, 0, '{now}', '{now}'),
          ('00000000-0000-4000-8000-000000000003', '个人', '#16A34A', 2, 0, '{now}', '{now}'),
          ('00000000-0000-4000-8000-000000000004', '学习', '#D97706', 3, 0, '{now}', '{now}');

        INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES
          ('00000000-0000-4000-8000-000000000101', '重要', '#E5484D', '{now}'),
          ('00000000-0000-4000-8000-000000000102', '紧急', '#F76B15', '{now}');

        INSERT OR IGNORE INTO settings (key, value) VALUES
          ('theme', '"system"'),
          ('language', '"zh-CN"'),
          ('reminders_enabled', 'true'),
          ('remind_minutes', '15'),
          ('backup_interval_hours', '24'),
          ('data_directory', 'null'),
          ('last_backup_at', 'null');
        "#
    ))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrated_db() -> Connection {
        let conn = open_in_memory().expect("open in-memory db");
        migrate(&conn).expect("migrate");
        conn
    }

    #[test]
    fn migrate_sets_schema_version_and_creates_tables() {
        let conn = migrated_db();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);

        let tables: Vec<String> = conn
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        for table in [
            "projects",
            "tags",
            "tasks",
            "task_tags",
            "settings",
            "resources",
            "ai_conversations",
            "task_attachments",
            "reminder_events",
            "task_templates",
            "audit_logs",
            "task_comments",
            "project_members",
            "library_resources",
        ] {
            assert!(tables.iter().any(|t| t == table), "缺少表 {table}");
        }
    }

    #[test]
    fn migrate_is_idempotent() {
        let conn = migrated_db();
        migrate(&conn).expect("second migrate should be no-op");
    }

    #[test]
    fn seed_defaults_is_idempotent_and_creates_defaults() {
        let conn = migrated_db();
        seed_defaults(&conn).expect("seed defaults");
        seed_defaults(&conn).expect("seed defaults again");

        let project_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        let tag_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
            .unwrap();
        let setting_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(project_count, 4);
        assert_eq!(tag_count, 2);
        assert_eq!(setting_count, 7);
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let conn = migrated_db();
        let result = conn.execute(
            "INSERT INTO tasks (id, title, project_id, created_at, updated_at)
             VALUES ('t1', '测试', 'missing-project', 'now', 'now')",
            [],
        );
        assert!(result.is_err());
    }
}
