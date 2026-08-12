use crate::error::AppError;
use crate::models::{now_iso, TaskKind, TaskTemplate, TaskTemplateInput};
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

fn template_from_row(row: &Row<'_>) -> Result<TaskTemplate, rusqlite::Error> {
    let tasks_json: String = row.get("tasks_json")?;
    let tasks = serde_json::from_str(&tasks_json).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(e))
    })?;
    Ok(TaskTemplate {
        id: row.get("id")?,
        name: row.get("name")?,
        project_id: row.get("project_id")?,
        tasks,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn list_task_templates(conn: &Connection) -> Result<Vec<TaskTemplate>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, project_id, tasks_json, created_at, updated_at
         FROM task_templates ORDER BY updated_at DESC, created_at DESC",
    )?;
    let rows = stmt.query_map([], template_from_row)?;
    let mut templates = Vec::new();
    for row in rows {
        templates.push(row?);
    }
    Ok(templates)
}

pub fn get_task_template(conn: &Connection, id: &str) -> Result<Option<TaskTemplate>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, project_id, tasks_json, created_at, updated_at
         FROM task_templates WHERE id = ?",
    )?;
    Ok(stmt.query_row(params![id], template_from_row).optional()?)
}

pub fn create_task_template(
    conn: &Connection,
    input: TaskTemplateInput,
) -> Result<TaskTemplate, AppError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("模板名称不能为空".to_string()));
    }
    if name.chars().count() > 80 {
        return Err(AppError::Validation("模板名称不能超过 80 字".to_string()));
    }
    if let Some(project_id) = &input.project_id {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?)",
            params![project_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::ProjectNotFound(project_id.clone()));
        }
    }
    if input.tasks.is_empty() {
        return Err(AppError::Validation("模板至少需要一个主任务".to_string()));
    }
    if input.tasks.len() != 1 || input.tasks[0].task_kind != TaskKind::Main {
        return Err(AppError::Validation(
            "模板根节点必须是一个主任务".to_string(),
        ));
    }

    let tasks_json = serde_json::to_string(&input.tasks)
        .map_err(|e| AppError::Validation(format!("模板数据序列化失败：{e}")))?;
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO task_templates (id, name, project_id, tasks_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            name,
            input.project_id,
            tasks_json,
            now.clone(),
            now.clone()
        ],
    )?;
    get_task_template(conn, &id)?.ok_or(AppError::TaskTemplateNotFound(id))
}

pub fn delete_task_template(conn: &Connection, id: &str) -> Result<(), AppError> {
    let changed = conn.execute("DELETE FROM task_templates WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(AppError::TaskTemplateNotFound(id.to_string()));
    }
    Ok(())
}

pub fn export_task_template_json(conn: &Connection, id: &str) -> Result<String, AppError> {
    let template = get_task_template(conn, id)?
        .ok_or_else(|| AppError::TaskTemplateNotFound(id.to_string()))?;
    serde_json::to_string_pretty(&serde_json::json!({
        "schemaVersion": 1,
        "name": template.name,
        "tasks": template.tasks
    }))
    .map_err(|e| AppError::Validation(format!("模板导出序列化失败：{e}")))
}

pub fn import_task_template_json(
    conn: &Connection,
    json_text: &str,
) -> Result<TaskTemplate, AppError> {
    let value: serde_json::Value = serde_json::from_str(json_text)
        .map_err(|e| AppError::Validation(format!("模板 JSON 格式错误：{e}")))?;
    let input: TaskTemplateInput = serde_json::from_value(value)
        .map_err(|e| AppError::Validation(format!("模板数据解析失败：{e}")))?;
    create_task_template(
        conn,
        TaskTemplateInput {
            name: input.name,
            project_id: None,
            tasks: input.tasks,
        },
    )
}

pub fn export_task_template_file(
    conn: &Connection,
    id: &str,
    output_path: &str,
) -> Result<(), AppError> {
    let json_text = export_task_template_json(conn, id)?;
    std::fs::write(output_path, json_text)?;
    Ok(())
}

pub fn import_task_template_file(
    conn: &Connection,
    file_path: &str,
) -> Result<TaskTemplate, AppError> {
    let json_text = std::fs::read_to_string(file_path)?;
    import_task_template_json(conn, &json_text)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::{TaskCreateInput, TaskKind};

    fn test_db() -> Connection {
        let conn = db::open_in_memory().expect("open in-memory db");
        db::migrate(&conn).expect("migrate");
        db::seed_defaults(&conn).expect("seed defaults");
        conn
    }

    #[test]
    fn template_crud_roundtrip() {
        let conn = test_db();
        let created = create_task_template(
            &conn,
            TaskTemplateInput {
                name: " 周报模板 ".into(),
                project_id: None,
                tasks: vec![TaskCreateInput {
                    title: "周报".into(),
                    task_kind: TaskKind::Main,
                    children: vec![TaskCreateInput {
                        title: "总结".into(),
                        task_kind: TaskKind::Major,
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
            },
        )
        .unwrap();
        assert_eq!(created.name, "周报模板");

        let list = list_task_templates(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].tasks.len(), 1);
        assert_eq!(list[0].tasks[0].children.len(), 1);

        let found = get_task_template(&conn, &created.id).unwrap().unwrap();
        assert_eq!(found.name, "周报模板");

        delete_task_template(&conn, &created.id).unwrap();
        assert!(get_task_template(&conn, &created.id).unwrap().is_none());
    }

    #[test]
    fn template_rejects_non_main_root_and_empty_name() {
        let conn = test_db();
        let result = create_task_template(
            &conn,
            TaskTemplateInput {
                name: "错误模板".into(),
                project_id: None,
                tasks: vec![TaskCreateInput {
                    title: "大任务".into(),
                    task_kind: TaskKind::Major,
                    ..Default::default()
                }],
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));

        let empty = create_task_template(
            &conn,
            TaskTemplateInput {
                name: "   ".into(),
                project_id: None,
                tasks: vec![TaskCreateInput {
                    title: "主任务".into(),
                    ..Default::default()
                }],
            },
        );
        assert!(matches!(empty, Err(AppError::Validation(_))));
    }
}
