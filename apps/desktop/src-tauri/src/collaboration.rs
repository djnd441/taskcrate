use crate::error::AppError;
use crate::models::{now_iso, ProjectMember, ProjectMemberInput, TaskComment, TaskCommentInput};
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

fn comment_from_row(row: &Row<'_>) -> rusqlite::Result<TaskComment> {
    Ok(TaskComment {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        author: row.get("author")?,
        content: row.get("content")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn member_from_row(row: &Row<'_>) -> rusqlite::Result<ProjectMember> {
    Ok(ProjectMember {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        name: row.get("name")?,
        email: row.get("email")?,
        role: row.get("role")?,
        created_at: row.get("created_at")?,
    })
}

pub fn list_task_comments(conn: &Connection, task_id: &str) -> Result<Vec<TaskComment>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, author, content, created_at, updated_at
         FROM task_comments WHERE task_id = ? ORDER BY created_at ASC, updated_at ASC",
    )?;
    let rows = stmt.query_map(params![task_id], comment_from_row)?;
    let mut comments = Vec::new();
    for row in rows {
        comments.push(row?);
    }
    Ok(comments)
}

pub fn list_all_task_comments(conn: &Connection) -> Result<Vec<TaskComment>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, author, content, created_at, updated_at
         FROM task_comments ORDER BY created_at ASC, updated_at ASC",
    )?;
    let rows = stmt.query_map([], comment_from_row)?;
    let mut comments = Vec::new();
    for row in rows {
        comments.push(row?);
    }
    Ok(comments)
}

pub fn add_task_comment(
    conn: &Connection,
    input: TaskCommentInput,
) -> Result<TaskComment, AppError> {
    let author = input.author.trim().to_string();
    let content = input.content.trim().to_string();
    if author.is_empty() {
        return Err(AppError::Validation("评论人不能为空".to_string()));
    }
    if content.is_empty() {
        return Err(AppError::Validation("评论内容不能为空".to_string()));
    }
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?)",
        params![input.task_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::TaskNotFound(input.task_id.clone()));
    }
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO task_comments (id, task_id, author, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, input.task_id, author, content, now.clone(), now.clone()],
    )?;
    get_task_comment(conn, &id)?.ok_or(AppError::Validation("评论创建失败".to_string()))
}

fn get_task_comment(conn: &Connection, id: &str) -> Result<Option<TaskComment>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, author, content, created_at, updated_at
         FROM task_comments WHERE id = ?",
    )?;
    Ok(stmt.query_row(params![id], comment_from_row).optional()?)
}

pub fn delete_task_comment(conn: &Connection, id: &str) -> Result<(), AppError> {
    let changed = conn.execute("DELETE FROM task_comments WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(AppError::Validation("评论不存在".to_string()));
    }
    Ok(())
}

pub fn list_project_members(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<ProjectMember>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, email, role, created_at
         FROM project_members WHERE project_id = ? ORDER BY name COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map(params![project_id], member_from_row)?;
    let mut members = Vec::new();
    for row in rows {
        members.push(row?);
    }
    Ok(members)
}

pub fn list_all_project_members(conn: &Connection) -> Result<Vec<ProjectMember>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, email, role, created_at
         FROM project_members ORDER BY name COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map([], member_from_row)?;
    let mut members = Vec::new();
    for row in rows {
        members.push(row?);
    }
    Ok(members)
}

pub fn add_project_member(
    conn: &Connection,
    input: ProjectMemberInput,
) -> Result<ProjectMember, AppError> {
    let name = input.name.trim().to_string();
    let email = input.email.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("成员名称不能为空".to_string()));
    }
    if !["viewer", "editor", "admin"].contains(&input.role.as_str()) {
        return Err(AppError::Validation("未知成员角色".to_string()));
    }
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?)",
        params![input.project_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::ProjectNotFound(input.project_id.clone()));
    }
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO project_members (id, project_id, name, email, role, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, input.project_id, name, email, input.role, now],
    )?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, email, role, created_at
         FROM project_members WHERE id = ?",
    )?;
    Ok(stmt
        .query_row(params![id], member_from_row)
        .optional()?
        .ok_or_else(|| AppError::Validation("成员创建失败".to_string()))?)
}

pub fn delete_project_member(conn: &Connection, id: &str) -> Result<(), AppError> {
    let changed = conn.execute("DELETE FROM project_members WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(AppError::Validation("成员不存在".to_string()));
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::TaskCreateInput;

    fn test_db() -> Connection {
        let conn = db::open_in_memory().unwrap();
        db::migrate(&conn).unwrap();
        db::seed_defaults(&conn).unwrap();
        conn
    }

    #[test]
    fn comment_crud_roundtrip() {
        let conn = test_db();
        let task = crate::repositories::create_task(
            &conn,
            TaskCreateInput {
                title: "评论测试".into(),
                ..Default::default()
            },
        )
        .unwrap();
        let comment = add_task_comment(
            &conn,
            TaskCommentInput {
                task_id: task.id.clone(),
                author: "张三".into(),
                content: "@李四 请尽快处理".into(),
            },
        )
        .unwrap();
        assert_eq!(comment.author, "张三");

        let list = list_task_comments(&conn, &task.id).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].content, "@李四 请尽快处理");

        delete_task_comment(&conn, &comment.id).unwrap();
        assert!(list_task_comments(&conn, &task.id).unwrap().is_empty());
    }

    #[test]
    fn project_member_crud_and_role_validation() {
        let conn = test_db();
        let project = crate::repositories::list_projects(&conn, false)
            .unwrap()
            .remove(0);
        let member = add_project_member(
            &conn,
            ProjectMemberInput {
                project_id: project.id.clone(),
                name: "王五".into(),
                email: "wang@example.com".into(),
                role: "editor".into(),
            },
        )
        .unwrap();
        assert_eq!(member.role, "editor");

        let bad = add_project_member(
            &conn,
            ProjectMemberInput {
                project_id: project.id.clone(),
                name: "坏角色".into(),
                email: String::new(),
                role: "owner".into(),
            },
        );
        assert!(matches!(bad, Err(AppError::Validation(_))));

        let list = list_project_members(&conn, &project.id).unwrap();
        assert_eq!(list.len(), 1);
        delete_project_member(&conn, &member.id).unwrap();
        assert!(list_project_members(&conn, &project.id).unwrap().is_empty());
    }

    #[test]
    fn comment_rejects_empty_task() {
        let conn = test_db();
        let result = add_task_comment(
            &conn,
            TaskCommentInput {
                task_id: "missing".into(),
                author: "张三".into(),
                content: "内容".into(),
            },
        );
        assert!(matches!(result, Err(AppError::TaskNotFound(_))));
    }
}
