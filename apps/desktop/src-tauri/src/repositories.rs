use crate::db::SCHEMA_VERSION;
use crate::error::AppError;
use crate::models::{
    now_iso, AiProvider, Priority, Project, ProjectCreateInput, ProjectUpdateInput,
    RepeatFrequency, Settings, SettingsPatch, Tag, TagCreateInput, TagUpdateInput, Task,
    TaskCreateInput, TaskFilter, TaskKind, TaskPage, TaskResource, TaskResourceInput, TaskSort,
    TaskSortDirection, TaskSortField, TaskStatus, TaskUpdateInput, ThemeMode,
};
use chrono::{DateTime, Duration as ChronoDuration, Months, SecondsFormat, Utc};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use uuid::Uuid;

fn push_param(params: &mut Vec<Box<dyn rusqlite::ToSql>>, value: impl rusqlite::ToSql + 'static) {
    params.push(Box::new(value));
}

fn like_pattern(query: &str) -> String {
    let escaped = query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

fn is_unique_violation(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(failure, _)
            if failure.code == rusqlite::ErrorCode::ConstraintViolation
    )
}

fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        title: row.get("title")?,
        notes: row.get("notes")?,
        due_at: row.get("due_at")?,
        repeat_frequency: row.get("repeat_frequency")?,
        repeat_interval: row.get("repeat_interval")?,
        repeat_end_at: row.get("repeat_end_at")?,
        assignee: row.get("assignee")?,
        department: row.get("department")?,
        start_at: row.get("start_at")?,
        done_criteria: row.get("done_criteria")?,
        budget: row.get("budget")?,
        priority: row.get("priority")?,
        status: row.get("status")?,
        project_id: row.get("project_id")?,
        tag_ids: Vec::new(),
        parent_id: row.get("parent_id")?,
        task_kind: row.get("task_kind")?,
        resources: Vec::new(),
        sort_order: row.get("sort_order")?,
        archived_at: row.get("archived_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        completed_at: row.get("completed_at")?,
        deleted_at: row.get("deleted_at")?,
        schema_version: row.get("schema_version")?,
    })
}

fn load_task_tags(conn: &Connection, task_id: &str) -> Result<Vec<String>, AppError> {
    let mut stmt =
        conn.prepare("SELECT tag_id FROM task_tags WHERE task_id = ? ORDER BY tag_id")?;
    let rows = stmt.query_map(params![task_id], |row| row.get::<_, String>(0))?;
    let mut tag_ids = Vec::new();
    for row in rows {
        tag_ids.push(row?);
    }
    Ok(tag_ids)
}

fn load_task_resources(conn: &Connection, task_id: &str) -> Result<Vec<TaskResource>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, quantity, unit, status, notes, sort_order, created_at, updated_at
         FROM resources WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![task_id], |row| {
        Ok(TaskResource {
            id: row.get("id")?,
            name: row.get("name")?,
            kind: row.get("kind")?,
            quantity: row.get("quantity")?,
            unit: row.get("unit")?,
            status: row.get("status")?,
            notes: row.get("notes")?,
            sort_order: row.get("sort_order")?,
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

pub(crate) fn replace_task_resources(
    conn: &Connection,
    task_id: &str,
    resources: &[TaskResourceInput],
) -> Result<(), AppError> {
    conn.execute("DELETE FROM resources WHERE task_id = ?", params![task_id])?;
    let now = now_iso();
    let mut stmt = conn.prepare(
        "INSERT INTO resources
           (id, task_id, name, kind, quantity, unit, status, notes, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )?;
    for resource in resources {
        let name = resource.name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::Validation("工具/资源名称不能为空".to_string()));
        }
        stmt.execute(params![
            Uuid::new_v4().to_string(),
            task_id,
            name,
            resource.kind,
            resource.quantity,
            resource.unit,
            resource.status,
            resource.notes,
            resource.sort_order,
            now.clone(),
            now.clone(),
        ])?;
    }
    Ok(())
}

pub(crate) fn replace_task_tags(
    conn: &Connection,
    task_id: &str,
    tag_ids: &[String],
) -> Result<(), AppError> {
    conn.execute("DELETE FROM task_tags WHERE task_id = ?", params![task_id])?;
    let mut stmt = conn.prepare("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)")?;
    for tag_id in tag_ids {
        stmt.execute(params![task_id, tag_id])?;
    }
    Ok(())
}

pub(crate) fn validate_tag_ids(conn: &Connection, tag_ids: &[String]) -> Result<(), AppError> {
    for tag_id in tag_ids {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tags WHERE id = ?)",
            params![tag_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::TagNotFound(tag_id.clone()));
        }
    }
    Ok(())
}

pub(crate) fn ensure_project_exists(conn: &Connection, project_id: &str) -> Result<(), AppError> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?)",
        params![project_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::ProjectNotFound(project_id.to_string()));
    }
    Ok(())
}

pub fn get_task(conn: &Connection, id: &str) -> Result<Option<Task>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, notes, due_at, repeat_frequency, repeat_interval, repeat_end_at,
                assignee, department, start_at, done_criteria, budget,
                priority, status, project_id, parent_id, task_kind,
                sort_order, archived_at, created_at, updated_at, completed_at, deleted_at, schema_version
         FROM tasks WHERE id = ?",
    )?;
    let mut task = stmt.query_row(params![id], task_from_row).optional()?;
    if let Some(task) = task.as_mut() {
        task.tag_ids = load_task_tags(conn, id)?;
        task.resources = load_task_resources(conn, id)?;
    }
    Ok(task)
}

pub fn create_task(conn: &Connection, input: TaskCreateInput) -> Result<Task, AppError> {
    let tx = conn.unchecked_transaction()?;
    let created = create_task_inner(&tx, input, None, 0)?;
    tx.commit()?;
    get_task(conn, &created.id)?.ok_or(AppError::TaskNotFound(created.id))
}

fn create_task_inner(
    conn: &Connection,
    input: TaskCreateInput,
    forced_parent_id: Option<String>,
    depth: usize,
) -> Result<Task, AppError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::Validation("任务标题不能为空".to_string()));
    }
    validate_tag_ids(conn, &input.tag_ids)?;
    if let Some(project_id) = &input.project_id {
        ensure_project_exists(conn, project_id)?;
    }

    let parent_id = if depth == 0 {
        input.parent_id.clone()
    } else {
        forced_parent_id
    };
    let project_id = if input.project_id.is_some() {
        input.project_id.clone()
    } else if let Some(parent_id) = parent_id.as_deref() {
        task_project_id(conn, parent_id)?
    } else {
        None
    };
    validate_task_hierarchy(conn, input.task_kind, parent_id.as_deref())?;
    validate_children_kinds(input.task_kind, &input.children)?;
    validate_repeat_settings(
        input.task_kind,
        input.repeat_frequency,
        input.repeat_interval,
    )?;

    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    let completed_at = if input.status == TaskStatus::Completed {
        Some(now.clone())
    } else {
        None
    };

    conn.execute(
                "INSERT INTO tasks
           (id, title, notes, due_at, repeat_frequency, repeat_interval, repeat_end_at,
            assignee, department, start_at, done_criteria, budget,
            priority, status, project_id, parent_id, task_kind,
            sort_order, created_at, updated_at, completed_at, schema_version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
                params![
            id,
            title,
            input.notes.clone().unwrap_or_default(),
            input.due_at,
            input.repeat_frequency,
            input.repeat_interval,
            input.repeat_end_at,
            input.assignee,
            input.department,
            input.start_at,
            input.done_criteria,
            input.budget,
            input.priority,
            input.status,
            project_id,
            parent_id,
            input.task_kind,
            input.sort_order,
            now,
            now,
            completed_at,
            SCHEMA_VERSION
        ],
    )?;
    replace_task_tags(conn, &id, &input.tag_ids)?;
    replace_task_resources(conn, &id, &input.resources)?;
    for child in &input.children {
        create_task_inner(conn, child.clone(), Some(id.clone()), depth + 1)?;
    }

    get_task(conn, &id)?.ok_or(AppError::TaskNotFound(id))
}

fn validate_existing_children_kinds(
    conn: &Connection,
    kind: TaskKind,
    id: &str,
) -> Result<(), AppError> {
    let children = load_children(conn, id)?;
    match kind {
        TaskKind::Main => {
            if children
                .iter()
                .any(|child| child.task_kind != TaskKind::Major)
            {
                return Err(AppError::Validation("主任务下只能添加大任务".to_string()));
            }
        }
        TaskKind::Major => {
            if children
                .iter()
                .any(|child| child.task_kind != TaskKind::Minor)
            {
                return Err(AppError::Validation("大任务下只能添加小任务".to_string()));
            }
        }
        TaskKind::Minor => {
            if !children.is_empty() {
                return Err(AppError::Validation("小任务不能再拆分子任务".to_string()));
            }
        }
    }
    Ok(())
}

fn validate_children_kinds(kind: TaskKind, children: &[TaskCreateInput]) -> Result<(), AppError> {
    match kind {
        TaskKind::Main => {
            if children
                .iter()
                .any(|child| child.task_kind != TaskKind::Major)
            {
                return Err(AppError::Validation("主任务下只能添加大任务".to_string()));
            }
        }
        TaskKind::Major => {
            if children
                .iter()
                .any(|child| child.task_kind != TaskKind::Minor)
            {
                return Err(AppError::Validation("大任务下只能添加小任务".to_string()));
            }
        }
        TaskKind::Minor => {
            if !children.is_empty() {
                return Err(AppError::Validation("小任务不能再拆分子任务".to_string()));
            }
        }
    }
    Ok(())
}

fn validate_task_hierarchy(
    conn: &Connection,
    kind: TaskKind,
    parent_id: Option<&str>,
) -> Result<(), AppError> {
    match (kind, parent_id) {
        (TaskKind::Main, Some(_)) => Err(AppError::Validation("主任务不能设置父任务".to_string())),
        (TaskKind::Major, None) => Err(AppError::Validation("大任务必须挂在主任务下".to_string())),
        (TaskKind::Minor, None) => Err(AppError::Validation("小任务必须挂在大任务下".to_string())),
        (TaskKind::Main, None) => Ok(()),
        (TaskKind::Major, Some(parent_id)) => {
            let parent_kind = task_kind_of(conn, parent_id)?;
            if parent_kind != TaskKind::Main {
                Err(AppError::Validation("大任务只能挂在主任务下".to_string()))
            } else {
                Ok(())
            }
        }
        (TaskKind::Minor, Some(parent_id)) => {
            let parent_kind = task_kind_of(conn, parent_id)?;
            if parent_kind != TaskKind::Major {
                Err(AppError::Validation("小任务只能挂在大任务下".to_string()))
            } else {
                Ok(())
            }
        }
    }
}

fn task_kind_of(conn: &Connection, id: &str) -> Result<TaskKind, AppError> {
    conn.query_row(
        "SELECT task_kind FROM tasks WHERE id = ?",
        params![id],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| AppError::TaskNotFound(id.to_string()))
}
fn task_project_id(conn: &Connection, id: &str) -> Result<Option<String>, AppError> {
    Ok(conn
        .query_row(
            "SELECT project_id FROM tasks WHERE id = ?",
            params![id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten())
}

fn cascade_project_to_descendants(
    conn: &Connection,
    id: &str,
    project_id: Option<&str>,
) -> Result<(), AppError> {
    conn.execute(
        "WITH RECURSIVE subtree(id) AS (
           SELECT id FROM tasks WHERE parent_id = ?1
           UNION ALL
           SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
         )
         UPDATE tasks SET project_id = ?2, updated_at = ?3
         WHERE id IN (SELECT id FROM subtree)",
        params![id, project_id, now_iso()],
    )?;
    Ok(())
}

fn archive_subtree(conn: &Connection, id: &str, archived_at: &str) -> Result<(), AppError> {
    conn.execute(
        "WITH RECURSIVE subtree(id) AS (
           SELECT id FROM tasks WHERE id = ?1
           UNION ALL
           SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
         )
         UPDATE tasks SET archived_at = ?2, updated_at = ?3
         WHERE id IN (SELECT id FROM subtree)",
        params![id, archived_at, now_iso()],
    )?;
    Ok(())
}

fn unarchive_subtree(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute(
        "WITH RECURSIVE subtree(id) AS (
           SELECT id FROM tasks WHERE id = ?1
           UNION ALL
           SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
         )
         UPDATE tasks SET archived_at = NULL, updated_at = ?2
         WHERE id IN (SELECT id FROM subtree)",
        params![id, now_iso()],
    )?;
    Ok(())
}

fn soft_delete_subtree(conn: &Connection, id: &str, deleted_at: &str) -> Result<(), AppError> {
    conn.execute(
        "WITH RECURSIVE subtree(id) AS (
           SELECT id FROM tasks WHERE id = ?1
           UNION ALL
           SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
         )
         UPDATE tasks SET deleted_at = ?2, updated_at = ?3
         WHERE id IN (SELECT id FROM subtree)",
        params![id, deleted_at, now_iso()],
    )?;
    Ok(())
}

fn restore_subtree(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute(
        "WITH RECURSIVE subtree(id) AS (
           SELECT id FROM tasks WHERE id = ?1
           UNION ALL
           SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
         )
         UPDATE tasks SET deleted_at = NULL, updated_at = ?2
         WHERE id IN (SELECT id FROM subtree)",
        params![id, now_iso()],
    )?;
    Ok(())
}

pub fn update_task(conn: &Connection, id: &str, input: TaskUpdateInput) -> Result<Task, AppError> {
    let mut task = get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))?;
    if task.deleted_at.is_some() {
        return Err(AppError::InvalidState(
            "任务在回收站中，无法编辑".to_string(),
        ));
    }

    let original_project_id = task.project_id.clone();
    let project_id_changed = input.project_id.is_some();

    if let Some(title) = input.title {
        let trimmed = title.trim().to_string();
        if trimmed.is_empty() {
            return Err(AppError::Validation("任务标题不能为空".to_string()));
        }
        task.title = trimmed;
    }
    if let Some(notes) = input.notes {
        task.notes = notes;
    }
    if let Some(due_at) = input.due_at {
        task.due_at = due_at;
    }
    if let Some(priority) = input.priority {
        task.priority = priority;
    }
    if let Some(project_id) = input.project_id {
        if let Some(project_id) = &project_id {
            ensure_project_exists(conn, project_id)?;
        }
        task.project_id = project_id;
    }
    if let Some(tag_ids) = input.tag_ids {
        validate_tag_ids(conn, &tag_ids)?;
        task.tag_ids = tag_ids;
    }
    if let Some(task_kind) = input.task_kind {
        task.task_kind = task_kind;
    }
    if let Some(repeat_frequency) = input.repeat_frequency {
        task.repeat_frequency = repeat_frequency;
    }
    if let Some(repeat_interval) = input.repeat_interval {
        task.repeat_interval = repeat_interval;
    }
    if let Some(repeat_end_at) = input.repeat_end_at {
        task.repeat_end_at = repeat_end_at;
    }
    if let Some(assignee) = input.assignee {
        task.assignee = assignee;
    }
    if let Some(department) = input.department {
        task.department = department;
    }
    if let Some(start_at) = input.start_at {
        task.start_at = start_at;
    }
    if let Some(done_criteria) = input.done_criteria {
        task.done_criteria = done_criteria;
    }
    if let Some(budget) = input.budget {
        task.budget = budget;
    }
    if let Some(parent_id) = input.parent_id {
        if let Some(parent_id) = &parent_id {
            if parent_id == id {
                return Err(AppError::Validation("任务不能设置自己为父任务".to_string()));
            }
            if is_descendant(conn, id, parent_id)? {
                return Err(AppError::Validation(
                    "任务不能移动到自己的子任务下".to_string(),
                ));
            }
        }
        task.parent_id = parent_id;
    }
    validate_task_hierarchy(conn, task.task_kind, task.parent_id.as_deref())?;
    validate_existing_children_kinds(conn, task.task_kind, id)?;
    validate_repeat_settings(task.task_kind, task.repeat_frequency, task.repeat_interval)?;
    if task.task_kind == TaskKind::Minor && has_children(conn, id)? {
        return Err(AppError::Validation("小任务不能包含子任务".to_string()));
    }
    if let Some(sort_order) = input.sort_order {
        task.sort_order = sort_order;
    }

    task.updated_at = now_iso();
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE tasks SET title = ?1, notes = ?2, due_at = ?3,
                repeat_frequency = ?4, repeat_interval = ?5, repeat_end_at = ?6,
                assignee = ?7, department = ?8, start_at = ?9, done_criteria = ?10, budget = ?11,
                priority = ?12,
                project_id = ?13, parent_id = ?14, task_kind = ?15, sort_order = ?16,
                updated_at = ?17 WHERE id = ?18",
        params![
            task.title,
            task.notes,
            task.due_at,
            task.repeat_frequency,
            task.repeat_interval,
            task.repeat_end_at,
            task.assignee,
            task.department,
            task.start_at,
            task.done_criteria,
            task.budget,
            task.priority,
            task.project_id,
            task.parent_id,
            task.task_kind,
            task.sort_order,
            task.updated_at,
            id
        ],
    )?;
    if project_id_changed && task.project_id != original_project_id {
        cascade_project_to_descendants(&tx, id, task.project_id.as_deref())?;
    }

    replace_task_tags(&tx, id, &task.tag_ids)?;
    if let Some(resources) = input.resources {
        replace_task_resources(&tx, id, &resources)?;
    }
    tx.commit()?;

    get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))
}

fn is_descendant(conn: &Connection, ancestor: &str, candidate: &str) -> Result<bool, AppError> {
    let mut current = Some(candidate.to_string());
    while let Some(task_id) = current {
        if task_id == ancestor {
            return Ok(true);
        }
        let parent_id: Option<String> = conn
            .query_row(
                "SELECT parent_id FROM tasks WHERE id = ?",
                params![task_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();
        current = parent_id;
    }
    Ok(false)
}

fn has_children(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE parent_id = ?",
        params![id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}
fn validate_repeat_settings(
    kind: TaskKind,
    frequency: RepeatFrequency,
    interval: i64,
) -> Result<(), AppError> {
    if frequency != RepeatFrequency::None && kind != TaskKind::Main {
        return Err(AppError::Validation(
            "只有主任务可以设置周期重复".to_string(),
        ));
    }
    if frequency != RepeatFrequency::None && interval < 1 {
        return Err(AppError::Validation("重复间隔至少为 1".to_string()));
    }
    Ok(())
}

fn next_due_at(
    due_at: Option<&str>,
    frequency: RepeatFrequency,
    interval: i64,
    now: &str,
    ends_at: Option<&str>,
) -> Result<Option<String>, AppError> {
    if frequency == RepeatFrequency::None {
        return Ok(None);
    }
    let now_dt = DateTime::parse_from_rfc3339(now)
        .map_err(|e| AppError::Validation(format!("当前时间格式无效：{e}")))?
        .with_timezone(&Utc);
    let base = match due_at {
        Some(value) => DateTime::parse_from_rfc3339(value)
            .map_err(|e| AppError::Validation(format!("截止时间格式无效：{e}")))?
            .with_timezone(&Utc),
        None => now_dt,
    };
    let end_dt = ends_at
        .map(|value| {
            DateTime::parse_from_rfc3339(value)
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(|e| AppError::Validation(format!("重复结束时间格式无效：{e}")))
        })
        .transpose()?;

    let mut next = base;
    let mut guard = 0;
    loop {
        next = match frequency {
            RepeatFrequency::Daily | RepeatFrequency::Custom => {
                next + ChronoDuration::days(interval)
            }
            RepeatFrequency::Weekly => next + ChronoDuration::days(interval * 7),
            RepeatFrequency::Monthly => next
                .checked_add_months(Months::new(interval as u32))
                .ok_or_else(|| AppError::Validation("周期计算超出支持范围".to_string()))?,
            RepeatFrequency::None => return Ok(None),
        };
        if let Some(end_dt) = end_dt {
            if next > end_dt {
                return Ok(None);
            }
        }
        if next > now_dt {
            return Ok(Some(next.to_rfc3339_opts(SecondsFormat::Millis, true)));
        }
        guard += 1;
        if guard >= 120 {
            return Ok(None);
        }
    }
}

fn load_children(conn: &Connection, id: &str) -> Result<Vec<Task>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, notes, due_at, repeat_frequency, repeat_interval, repeat_end_at,
                assignee, department, start_at, done_criteria, budget,
                priority, status, project_id, parent_id, task_kind,
                sort_order, archived_at, created_at, updated_at, completed_at, deleted_at, schema_version
         FROM tasks WHERE parent_id = ? ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![id], task_from_row)?;
    let mut tasks = Vec::new();
    for row in rows {
        let mut task = row?;
        task.tag_ids = load_task_tags(conn, &task.id)?;
        task.resources = load_task_resources(conn, &task.id)?;
        tasks.push(task);
    }
    Ok(tasks)
}

fn task_to_create_input(
    conn: &Connection,
    task: &Task,
    due_at: Option<String>,
) -> Result<TaskCreateInput, AppError> {
    let children = load_children(conn, &task.id)?;
    Ok(TaskCreateInput {
        title: task.title.clone(),
        notes: Some(task.notes.clone()),
        due_at,
        repeat_frequency: task.repeat_frequency,
        repeat_interval: task.repeat_interval,
        repeat_end_at: task.repeat_end_at.clone(),
        assignee: task.assignee.clone(),
        department: task.department.clone(),
        start_at: task.start_at.clone(),
        done_criteria: task.done_criteria.clone(),
        budget: task.budget.clone(),
        priority: task.priority,
        status: TaskStatus::Todo,
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
        children: children
            .iter()
            .map(|child| task_to_create_input(conn, child, child.due_at.clone()))
            .collect::<Result<Vec<_>, _>>()?,
        sort_order: task.sort_order,
    })
}

fn spawn_next_recurrence(
    conn: &Connection,
    task: &Task,
    now: &str,
) -> Result<Option<Task>, AppError> {
    if task.task_kind != TaskKind::Main || task.repeat_frequency == RepeatFrequency::None {
        return Ok(None);
    }
    let Some(next_due) = next_due_at(
        task.due_at.as_deref(),
        task.repeat_frequency,
        task.repeat_interval,
        now,
        task.repeat_end_at.as_deref(),
    )?
    else {
        return Ok(None);
    };
    let input = task_to_create_input(conn, task, Some(next_due))?;
    let created = create_task_inner(conn, input, None, 0)?;
    Ok(Some(created))
}

pub fn transition_task_status(
    conn: &Connection,
    id: &str,
    status: TaskStatus,
) -> Result<Task, AppError> {
    let mut task = get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))?;
    if task.deleted_at.is_some() {
        return Err(AppError::InvalidState(
            "任务在回收站中，无法变更状态".to_string(),
        ));
    }

    let now = now_iso();
    crate::state_machine::apply_status_transition(&mut task, status, &now)?;

    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
        params![task.status, task.completed_at, task.updated_at, id],
    )?;
    if task.status == TaskStatus::Completed {
        spawn_next_recurrence(&tx, &task, &now)?;
    }
    tx.commit()?;

    get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))
}

pub fn archive_task(conn: &Connection, id: &str) -> Result<Task, AppError> {
    let task = get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))?;
    if task.deleted_at.is_some() {
        return Err(AppError::InvalidState(
            "任务在回收站中，无法归档".to_string(),
        ));
    }
    let now = now_iso();
    archive_subtree(conn, &id, &now)?;
    get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))
}

pub fn unarchive_task(conn: &Connection, id: &str) -> Result<Task, AppError> {
    let _task = get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))?;
    unarchive_subtree(conn, &id)?;
    get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))
}

pub fn soft_delete_task(conn: &Connection, id: &str) -> Result<Task, AppError> {
    let _task = get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))?;
    let now = now_iso();
    soft_delete_subtree(conn, &id, &now)?;
    get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))
}

pub fn restore_task(conn: &Connection, id: &str) -> Result<Task, AppError> {
    let _task = get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))?;
    restore_subtree(conn, &id)?;
    get_task(conn, id)?.ok_or_else(|| AppError::TaskNotFound(id.to_string()))
}

pub fn hard_delete_task(conn: &Connection, id: &str) -> Result<(), AppError> {
    let changed = conn.execute("DELETE FROM tasks WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(AppError::TaskNotFound(id.to_string()));
    }
    Ok(())
}

pub fn list_due_reminders(
    conn: &Connection,
    before: &str,
    limit: i64,
) -> Result<Vec<Task>, AppError> {
    let filter = TaskFilter {
        statuses: Some(vec![TaskStatus::Todo, TaskStatus::InProgress]),
        due_until: Some(before.to_string()),
        ..Default::default()
    };
    let sort = TaskSort {
        field: TaskSortField::DueAt,
        direction: TaskSortDirection::Asc,
    };
    Ok(list_tasks(conn, filter, sort, 0, limit)?.items)
}

pub fn batch_complete_tasks(conn: &Connection, ids: &[String]) -> Result<usize, AppError> {
    if ids.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    let mut count = 0;
    for id in ids {
        let mut task = get_task(&tx, id)?.ok_or_else(|| AppError::TaskNotFound(id.clone()))?;
        if task.deleted_at.is_some() || task.status == TaskStatus::Completed {
            continue;
        }
        let now = now_iso();
        crate::state_machine::apply_status_transition(&mut task, TaskStatus::Completed, &now)?;
        tx.execute(
            "UPDATE tasks SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
            params![task.status, task.completed_at, task.updated_at, id],
        )?;
        if task.status == TaskStatus::Completed {
            spawn_next_recurrence(&tx, &task, &now)?;
        }
        count += 1;
    }
    tx.commit()?;
    Ok(count)
}

pub fn batch_soft_delete_tasks(conn: &Connection, ids: &[String]) -> Result<usize, AppError> {
    if ids.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    let now = now_iso();
    let mut count = 0;
    for id in ids {
        let task = get_task(&tx, id)?.ok_or_else(|| AppError::TaskNotFound(id.clone()))?;
        if task.deleted_at.is_some() {
            continue;
        }
        soft_delete_subtree(&tx, &id, &now)?;
        count += 1;
    }
    tx.commit()?;
    Ok(count)
}

pub fn batch_restore_tasks(conn: &Connection, ids: &[String]) -> Result<usize, AppError> {
    if ids.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    let mut count = 0;
    for id in ids {
        let task = get_task(&tx, id)?.ok_or_else(|| AppError::TaskNotFound(id.clone()))?;
        if task.deleted_at.is_none() {
            continue;
        }
        restore_subtree(&tx, &id)?;
        count += 1;
    }
    tx.commit()?;
    Ok(count)
}

pub fn batch_hard_delete_tasks(conn: &Connection, ids: &[String]) -> Result<usize, AppError> {
    if ids.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    let mut count = 0;
    for id in ids {
        let changed = tx.execute("DELETE FROM tasks WHERE id = ?", params![id])?;
        count += changed;
    }
    tx.commit()?;
    Ok(count)
}

pub fn clear_trash(conn: &Connection) -> Result<usize, AppError> {
    let changed = conn.execute("DELETE FROM tasks WHERE deleted_at IS NOT NULL", [])?;
    Ok(changed)
}

pub fn batch_set_priority(
    conn: &Connection,
    ids: &[String],
    priority: Priority,
) -> Result<usize, AppError> {
    if ids.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    let now = now_iso();
    let mut count = 0;
    for id in ids {
        let task = get_task(&tx, id)?.ok_or_else(|| AppError::TaskNotFound(id.clone()))?;
        if task.deleted_at.is_some() {
            continue;
        }
        tx.execute(
            "UPDATE tasks SET priority = ?1, updated_at = ?2 WHERE id = ?3",
            params![priority, now, id],
        )?;
        count += 1;
    }
    tx.commit()?;
    Ok(count)
}

pub fn batch_set_project(
    conn: &Connection,
    ids: &[String],
    project_id: Option<String>,
) -> Result<usize, AppError> {
    if ids.is_empty() {
        return Ok(0);
    }
    if let Some(project_id) = &project_id {
        ensure_project_exists(conn, project_id)?;
    }
    let tx = conn.unchecked_transaction()?;
    let now = now_iso();
    let mut count = 0;
    for id in ids {
        let task = get_task(&tx, id)?.ok_or_else(|| AppError::TaskNotFound(id.clone()))?;
        if task.deleted_at.is_some() {
            continue;
        }
        tx.execute(
            "UPDATE tasks SET project_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![project_id, now, id],
        )?;
        count += 1;
        cascade_project_to_descendants(&tx, &id, project_id.as_deref())?;
    }
    tx.commit()?;
    Ok(count)
}

pub fn batch_add_tags(
    conn: &Connection,
    ids: &[String],
    tag_ids: &[String],
) -> Result<usize, AppError> {
    if ids.is_empty() {
        return Ok(0);
    }
    validate_tag_ids(conn, tag_ids)?;
    let tx = conn.unchecked_transaction()?;
    let mut count = 0;
    for id in ids {
        let task = get_task(&tx, id)?.ok_or_else(|| AppError::TaskNotFound(id.clone()))?;
        if task.deleted_at.is_some() {
            continue;
        }
        let mut merged = task.tag_ids.clone();
        for tag_id in tag_ids {
            if !merged.iter().any(|existing| existing == tag_id) {
                merged.push(tag_id.clone());
            }
        }
        tx.execute(
            "UPDATE tasks SET updated_at = ?1 WHERE id = ?2",
            params![now_iso(), id],
        )?;
        replace_task_tags(&tx, id, &merged)?;
        count += 1;
    }
    tx.commit()?;
    Ok(count)
}

fn build_task_where(
    filter: &TaskFilter,
) -> Result<(String, Vec<Box<dyn rusqlite::ToSql>>), AppError> {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(query) = filter
        .query
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
    {
        let pattern = like_pattern(query);
        clauses.push("(t.title LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\')".to_string());
        push_param(&mut params, pattern.clone());
        push_param(&mut params, pattern);
    }

    if let Some(statuses) = &filter.statuses {
        if !statuses.is_empty() {
            let placeholders = (0..statuses.len())
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(",");
            clauses.push(format!("t.status IN ({placeholders})"));
            for status in statuses {
                push_param(&mut params, *status);
            }
        }
    }

    if let Some(priorities) = &filter.priorities {
        if !priorities.is_empty() {
            let placeholders = (0..priorities.len())
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(",");
            clauses.push(format!("t.priority IN ({placeholders})"));
            for priority in priorities {
                push_param(&mut params, *priority);
            }
        }
    }

    match filter.project_id.as_ref() {
        Some(Some(project_id)) => {
            clauses.push("t.project_id = ?".to_string());
            push_param(&mut params, project_id.clone());
        }
        Some(None) => clauses.push("t.project_id IS NULL".to_string()),
        None => {}
    }

    if let Some(tag_ids) = &filter.tag_ids {
        if !tag_ids.is_empty() {
            let placeholders = (0..tag_ids.len())
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(",");
            clauses.push(format!(
                "EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id IN ({placeholders}))"
            ));
            for tag_id in tag_ids {
                push_param(&mut params, tag_id.clone());
            }
        }
    }

    if let Some(due_from) = &filter.due_from {
        clauses.push("t.due_at >= ?".to_string());
        push_param(&mut params, due_from.clone());
    }
    if let Some(due_until) = &filter.due_until {
        clauses.push("t.due_at <= ?".to_string());
        push_param(&mut params, due_until.clone());
    }
    if !filter.include_archived {
        clauses.push("t.archived_at IS NULL".to_string());
    }
    if !filter.include_deleted {
        clauses.push("t.deleted_at IS NULL".to_string());
    }

    let where_sql = if clauses.is_empty() {
        "WHERE 1=1".to_string()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };
    Ok((where_sql, params))
}

fn sort_clause(sort: TaskSort) -> String {
    let column = match sort.field {
        TaskSortField::CreatedAt => "t.created_at",
        TaskSortField::UpdatedAt => "t.updated_at",
        TaskSortField::DueAt => "t.due_at",
        TaskSortField::Priority => {
            "CASE t.priority WHEN 'none' THEN 0 WHEN 'low' THEN 1 WHEN 'medium' THEN 2
             WHEN 'high' THEN 3 WHEN 'urgent' THEN 4 ELSE 0 END"
        }
        TaskSortField::SortOrder => "t.sort_order",
    };
    let direction = match sort.direction {
        TaskSortDirection::Asc => "ASC",
        TaskSortDirection::Desc => "DESC",
    };
    format!("{column} {direction}, t.created_at ASC")
}

pub fn list_tasks(
    conn: &Connection,
    filter: TaskFilter,
    sort: TaskSort,
    offset: i64,
    limit: i64,
) -> Result<TaskPage, AppError> {
    let limit = if limit <= 0 { 100 } else { limit.min(100_000) };
    let offset = offset.max(0);
    let (where_sql, params) = build_task_where(&filter)?;

    let count_sql = format!("SELECT COUNT(*) FROM tasks t {where_sql}");
    let total: i64 = {
        let mut stmt = conn.prepare(&count_sql)?;
        stmt.query_row(params_from_iter(params.iter()), |row| row.get(0))?
    };

    let order_sql = sort_clause(sort);
    let sql = format!(
        "SELECT t.id, t.title, t.notes, t.due_at, t.repeat_frequency, t.repeat_interval,
                t.repeat_end_at, t.assignee, t.department, t.start_at, t.done_criteria, t.budget,
                t.priority, t.status, t.project_id,
                t.parent_id, t.task_kind, t.sort_order, t.archived_at, t.created_at,
                t.updated_at, t.completed_at, t.deleted_at, t.schema_version
         FROM tasks t {where_sql}
         ORDER BY {order_sql}
         LIMIT ? OFFSET ?"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut all_params: Vec<Box<dyn rusqlite::ToSql>> = params;
    push_param(&mut all_params, limit);
    push_param(&mut all_params, offset);

    let rows = stmt.query_map(params_from_iter(all_params.iter()), task_from_row)?;
    let mut items = Vec::new();
    for row in rows {
        let mut task = row?;
        task.tag_ids = load_task_tags(conn, &task.id)?;
        task.resources = load_task_resources(conn, &task.id)?;
        items.push(task);
    }

    Ok(TaskPage {
        items,
        total,
        offset,
        limit,
    })
}

fn project_from_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    let is_archived: i32 = row.get("is_archived")?;
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        sort_order: row.get("sort_order")?,
        is_archived: is_archived != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn get_project(conn: &Connection, id: &str) -> Result<Option<Project>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, sort_order, is_archived, created_at, updated_at
         FROM projects WHERE id = ?",
    )?;
    Ok(stmt.query_row(params![id], project_from_row).optional()?)
}

pub fn list_projects(conn: &Connection, include_archived: bool) -> Result<Vec<Project>, AppError> {
    let sql = if include_archived {
        "SELECT id, name, color, sort_order, is_archived, created_at, updated_at
         FROM projects ORDER BY sort_order ASC, created_at ASC"
    } else {
        "SELECT id, name, color, sort_order, is_archived, created_at, updated_at
         FROM projects WHERE is_archived = 0 ORDER BY sort_order ASC, created_at ASC"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], project_from_row)?;
    let mut projects = Vec::new();
    for row in rows {
        projects.push(row?);
    }
    Ok(projects)
}

pub fn create_project(conn: &Connection, input: ProjectCreateInput) -> Result<Project, AppError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("项目名称不能为空".to_string()));
    }
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO projects (id, name, color, sort_order, is_archived, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)",
        params![id, name, input.color, input.sort_order, now, now],
    )?;
    get_project(conn, &id)?.ok_or(AppError::ProjectNotFound(id))
}

pub fn update_project(
    conn: &Connection,
    id: &str,
    input: ProjectUpdateInput,
) -> Result<Project, AppError> {
    let mut project =
        get_project(conn, id)?.ok_or_else(|| AppError::ProjectNotFound(id.to_string()))?;
    if let Some(name) = input.name {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err(AppError::Validation("项目名称不能为空".to_string()));
        }
        project.name = trimmed;
    }
    if let Some(color) = input.color {
        project.color = color;
    }
    if let Some(sort_order) = input.sort_order {
        project.sort_order = sort_order;
    }
    if let Some(is_archived) = input.is_archived {
        project.is_archived = is_archived;
    }
    project.updated_at = now_iso();

    conn.execute(
        "UPDATE projects SET name = ?1, color = ?2, sort_order = ?3, is_archived = ?4,
                updated_at = ?5 WHERE id = ?6",
        params![
            project.name,
            project.color,
            project.sort_order,
            project.is_archived,
            project.updated_at,
            id
        ],
    )?;
    if input.is_archived == Some(true) {
        conn.execute(
            "UPDATE tasks SET archived_at = ?1, updated_at = ?2
             WHERE project_id = ?3 AND deleted_at IS NULL AND archived_at IS NULL",
            params![project.updated_at, project.updated_at, id],
        )?;
    } else if input.is_archived == Some(false) {
        conn.execute(
            "UPDATE tasks SET archived_at = NULL, updated_at = ?1
             WHERE project_id = ?2 AND deleted_at IS NULL AND archived_at IS NOT NULL",
            params![project.updated_at, id],
        )?;
    }
    get_project(conn, id)?.ok_or_else(|| AppError::ProjectNotFound(id.to_string()))
}

pub fn archive_project(conn: &Connection, id: &str) -> Result<Project, AppError> {
    update_project(
        conn,
        id,
        ProjectUpdateInput {
            is_archived: Some(true),
            ..Default::default()
        },
    )
}

pub fn delete_project(conn: &Connection, id: &str) -> Result<(), AppError> {
    let changed = conn.execute("DELETE FROM projects WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(AppError::ProjectNotFound(id.to_string()));
    }
    Ok(())
}

fn tag_from_row(row: &Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
    })
}

pub fn get_tag(conn: &Connection, id: &str) -> Result<Option<Tag>, AppError> {
    let mut stmt = conn.prepare("SELECT id, name, color, created_at FROM tags WHERE id = ?")?;
    Ok(stmt.query_row(params![id], tag_from_row).optional()?)
}

pub fn list_tags(conn: &Connection) -> Result<Vec<Tag>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, created_at FROM tags ORDER BY created_at ASC, name ASC",
    )?;
    let rows = stmt.query_map([], tag_from_row)?;
    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

pub fn create_tag(conn: &Connection, input: TagCreateInput) -> Result<Tag, AppError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("标签名称不能为空".to_string()));
    }
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    match conn.execute(
        "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, input.color, now],
    ) {
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::Validation("标签名称已存在".to_string()));
        }
        Err(error) => return Err(error.into()),
    }
    get_tag(conn, &id)?.ok_or(AppError::TagNotFound(id))
}

pub fn update_tag(conn: &Connection, id: &str, input: TagUpdateInput) -> Result<Tag, AppError> {
    let mut tag = get_tag(conn, id)?.ok_or_else(|| AppError::TagNotFound(id.to_string()))?;
    if let Some(name) = input.name {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err(AppError::Validation("标签名称不能为空".to_string()));
        }
        tag.name = trimmed;
    }
    if let Some(color) = input.color {
        tag.color = color;
    }

    let result = conn.execute(
        "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
        params![tag.name, tag.color, id],
    );
    if let Err(error) = result {
        if is_unique_violation(&error) {
            return Err(AppError::Validation("标签名称已存在".to_string()));
        }
        return Err(error.into());
    }
    get_tag(conn, id)?.ok_or_else(|| AppError::TagNotFound(id.to_string()))
}

pub fn delete_tag(conn: &Connection, id: &str) -> Result<(), AppError> {
    let changed = conn.execute("DELETE FROM tags WHERE id = ?", params![id])?;
    if changed == 0 {
        return Err(AppError::TagNotFound(id.to_string()));
    }
    Ok(())
}

pub(crate) fn upsert_setting(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_settings(conn: &Connection) -> Result<Settings, AppError> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut values = std::collections::HashMap::new();
    for row in rows {
        let (key, value) = row?;
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&value) {
            values.insert(key, parsed);
        }
    }

    let theme = match values.get("theme").and_then(|v| v.as_str()) {
        Some("light") => ThemeMode::Light,
        Some("dark") => ThemeMode::Dark,
        _ => ThemeMode::System,
    };
    let ai_provider = match values.get("ai_provider").and_then(|v| v.as_str()) {
        Some("local") => AiProvider::Local,
        Some("cloud") => AiProvider::Cloud,
        _ => AiProvider::Off,
    };
    let ai_base_url = values
        .get("ai_base_url")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| match ai_provider {
            AiProvider::Local => "http://127.0.0.1:11434/v1".to_string(),
            AiProvider::Cloud => "https://api.openai.com/v1".to_string(),
            AiProvider::Off => String::new(),
        });
    Ok(Settings {
        theme,
        language: values
            .get("language")
            .and_then(|v| v.as_str())
            .unwrap_or("zh-CN")
            .to_string(),
        reminders_enabled: values
            .get("reminders_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        remind_minutes: values
            .get("remind_minutes")
            .and_then(|v| v.as_i64())
            .unwrap_or(15),
        reminder_sound_enabled: values
            .get("reminder_sound_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        remind_when_closed: values
            .get("remind_when_closed")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        backup_interval_hours: values.get("backup_interval_hours").and_then(|v| v.as_i64()),
        data_directory: values
            .get("data_directory")
            .and_then(|v| v.as_str())
            .map(String::from),
        last_backup_at: values
            .get("last_backup_at")
            .and_then(|v| v.as_str())
            .map(String::from),
        ai_provider,
        ai_base_url,
        ai_model: values
            .get("ai_model")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| match ai_provider {
                AiProvider::Local => "qwen2.5".to_string(),
                AiProvider::Cloud => "gpt-4o-mini".to_string(),
                AiProvider::Off => String::new(),
            }),
        ai_temperature: values
            .get("ai_temperature")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.7),
        ai_tools_enabled: values
            .get("ai_tools_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        ai_confirm_destructive: values
            .get("ai_confirm_destructive")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        ai_api_key_configured: false,
        webhook_ding_talk: String::new(),
        webhook_we_com: String::new(),
        webhook_feishu: String::new(),
        webhook_ding_talk_configured: false,
        webhook_we_com_configured: false,
        webhook_feishu_configured: false,
        schema_version: SCHEMA_VERSION,
    })
}

pub fn update_settings(conn: &Connection, patch: SettingsPatch) -> Result<Settings, AppError> {
    let tx = conn.unchecked_transaction()?;
    if let Some(theme) = patch.theme {
        let value =
            serde_json::to_string(&theme).map_err(|e| AppError::Validation(e.to_string()))?;
        upsert_setting(&tx, "theme", &value)?;
    }
    if let Some(language) = patch.language {
        if language.trim().is_empty() {
            return Err(AppError::Validation("语言不能为空".to_string()));
        }
        upsert_setting(
            &tx,
            "language",
            &serde_json::to_string(&language).map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(reminders_enabled) = patch.reminders_enabled {
        upsert_setting(
            &tx,
            "reminders_enabled",
            &serde_json::to_string(&reminders_enabled)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(remind_minutes) = patch.remind_minutes {
        upsert_setting(
            &tx,
            "remind_minutes",
            &serde_json::to_string(&remind_minutes)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(reminder_sound_enabled) = patch.reminder_sound_enabled {
        upsert_setting(
            &tx,
            "reminder_sound_enabled",
            &serde_json::to_string(&reminder_sound_enabled)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(remind_when_closed) = patch.remind_when_closed {
        upsert_setting(
            &tx,
            "remind_when_closed",
            &serde_json::to_string(&remind_when_closed)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(backup_interval_hours) = patch.backup_interval_hours {
        upsert_setting(
            &tx,
            "backup_interval_hours",
            &serde_json::to_string(&backup_interval_hours)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(data_directory) = patch.data_directory {
        upsert_setting(
            &tx,
            "data_directory",
            &serde_json::to_string(&data_directory)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(last_backup_at) = patch.last_backup_at {
        upsert_setting(
            &tx,
            "last_backup_at",
            &serde_json::to_string(&last_backup_at)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(ai_provider) = patch.ai_provider {
        upsert_setting(
            &tx,
            "ai_provider",
            &serde_json::to_string(&ai_provider)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(ai_base_url) = patch.ai_base_url {
        upsert_setting(
            &tx,
            "ai_base_url",
            &serde_json::to_string(&ai_base_url)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(ai_model) = patch.ai_model {
        let model = ai_model.trim().to_string();
        if model.is_empty() {
            return Err(AppError::Validation("模型名称不能为空".to_string()));
        }
        upsert_setting(
            &tx,
            "ai_model",
            &serde_json::to_string(&model).map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(ai_temperature) = patch.ai_temperature {
        if !(0.0..=2.0).contains(&ai_temperature) {
            return Err(AppError::Validation(
                "AI 温度必须在 0 到 2 之间".to_string(),
            ));
        }
        upsert_setting(
            &tx,
            "ai_temperature",
            &serde_json::to_string(&ai_temperature)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(ai_tools_enabled) = patch.ai_tools_enabled {
        upsert_setting(
            &tx,
            "ai_tools_enabled",
            &serde_json::to_string(&ai_tools_enabled)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    if let Some(ai_confirm_destructive) = patch.ai_confirm_destructive {
        upsert_setting(
            &tx,
            "ai_confirm_destructive",
            &serde_json::to_string(&ai_confirm_destructive)
                .map_err(|e| AppError::Validation(e.to_string()))?,
        )?;
    }
    tx.commit()?;
    get_settings(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::Priority;
    use std::time::Instant;

    fn test_db() -> Connection {
        let conn = db::open_in_memory().expect("open in-memory db");
        db::migrate(&conn).expect("migrate");
        db::seed_defaults(&conn).expect("seed defaults");
        conn
    }

    fn task_input(title: &str) -> TaskCreateInput {
        TaskCreateInput {
            title: title.to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn task_crud_and_lifecycle() {
        let conn = test_db();
        let work = list_projects(&conn, false)
            .unwrap()
            .into_iter()
            .find(|p| p.name == "工作")
            .unwrap();
        let important = list_tags(&conn)
            .unwrap()
            .into_iter()
            .find(|t| t.name == "重要")
            .unwrap();

        let created = create_task(
            &conn,
            TaskCreateInput {
                title: "  编写周报  ".into(),
                notes: Some("汇总本周进展".into()),
                due_at: Some("2026-08-10T10:00:00.000Z".into()),
                priority: Priority::High,
                project_id: Some(work.id.clone()),
                tag_ids: vec![important.id.clone()],
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(created.title, "编写周报");
        assert_eq!(created.notes, "汇总本周进展");
        assert_eq!(created.project_id.as_deref(), Some(work.id.as_str()));
        assert_eq!(created.tag_ids, vec![important.id]);
        assert_eq!(created.schema_version, SCHEMA_VERSION);

        let updated = update_task(
            &conn,
            &created.id,
            TaskUpdateInput {
                title: Some("编写双周报".into()),
                priority: Some(Priority::Urgent),
                due_at: Some(None),
                project_id: Some(None),
                tag_ids: Some(Vec::new()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.title, "编写双周报");
        assert_eq!(updated.priority, Priority::Urgent);
        assert!(updated.due_at.is_none());
        assert!(updated.project_id.is_none());
        assert!(updated.tag_ids.is_empty());

        let in_progress =
            transition_task_status(&conn, &created.id, TaskStatus::InProgress).unwrap();
        assert_eq!(in_progress.status, TaskStatus::InProgress);
        let completed = transition_task_status(&conn, &created.id, TaskStatus::Completed).unwrap();
        assert!(completed.completed_at.is_some());

        let rejected = transition_task_status(&conn, &created.id, TaskStatus::Cancelled);
        assert!(matches!(rejected, Err(AppError::InvalidTransition(_))));

        let archived = archive_task(&conn, &created.id).unwrap();
        assert!(archived.archived_at.is_some());
        let unarchived = unarchive_task(&conn, &created.id).unwrap();
        assert!(unarchived.archived_at.is_none());

        let deleted = soft_delete_task(&conn, &created.id).unwrap();
        assert!(deleted.deleted_at.is_some());
        assert!(get_task(&conn, &created.id).unwrap().is_some());
        assert_eq!(
            list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100)
                .unwrap()
                .total,
            0
        );
        let restored = restore_task(&conn, &created.id).unwrap();
        assert!(restored.deleted_at.is_none());

        hard_delete_task(&conn, &created.id).unwrap();
        assert!(get_task(&conn, &created.id).unwrap().is_none());
    }

    #[test]
    fn task_hierarchy_and_resources() {
        let conn = test_db();
        let main = create_task(
            &conn,
            TaskCreateInput {
                title: "主任务".into(),
                resources: vec![TaskResourceInput {
                    name: "电脑".into(),
                    ..Default::default()
                }],
                children: vec![TaskCreateInput {
                    title: "大任务".into(),
                    task_kind: TaskKind::Major,
                    resources: vec![TaskResourceInput {
                        name: "会议室".into(),
                        ..Default::default()
                    }],
                    children: vec![TaskCreateInput {
                        title: "小任务".into(),
                        task_kind: TaskKind::Minor,
                        resources: vec![TaskResourceInput {
                            name: "投影仪".into(),
                            ..Default::default()
                        }],
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(main.task_kind, TaskKind::Main);
        assert!(main.parent_id.is_none());
        assert_eq!(main.resources.len(), 1);

        let all = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        assert_eq!(all.total, 3);
        let major = all
            .items
            .iter()
            .find(|task| task.task_kind == TaskKind::Major)
            .unwrap();
        let minor = all
            .items
            .iter()
            .find(|task| task.task_kind == TaskKind::Minor)
            .unwrap();
        assert_eq!(major.parent_id.as_deref(), Some(main.id.as_str()));
        assert_eq!(major.resources.len(), 1);
        assert_eq!(minor.parent_id.as_deref(), Some(major.id.as_str()));
        assert_eq!(minor.resources[0].name, "投影仪");

        let updated = update_task(
            &conn,
            &main.id,
            TaskUpdateInput {
                resources: Some(vec![TaskResourceInput {
                    name: "打印机".into(),
                    ..Default::default()
                }]),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.resources.len(), 1);
        assert_eq!(updated.resources[0].name, "打印机");

        hard_delete_task(&conn, &main.id).unwrap();
        let after = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        assert_eq!(after.total, 0);
    }

    #[test]
    fn children_inherit_project_and_project_moves_cascade() {
        let conn = test_db();
        let projects = list_projects(&conn, false).unwrap();
        let work = projects
            .iter()
            .find(|p| p.name == "工作")
            .unwrap()
            .id
            .clone();
        let personal = projects
            .iter()
            .find(|p| p.name == "个人")
            .unwrap()
            .id
            .clone();
        let main = create_task(
            &conn,
            TaskCreateInput {
                title: "项目主任务".into(),
                project_id: Some(work.clone()),
                children: vec![TaskCreateInput {
                    title: "大任务".into(),
                    task_kind: TaskKind::Major,
                    children: vec![TaskCreateInput {
                        title: "小任务".into(),
                        task_kind: TaskKind::Minor,
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
                ..Default::default()
            },
        )
        .unwrap();
        let all = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        for task in &all.items {
            assert_eq!(task.project_id.as_deref(), Some(work.as_str()));
        }

        update_task(
            &conn,
            &main.id,
            TaskUpdateInput {
                project_id: Some(Some(personal.clone())),
                ..Default::default()
            },
        )
        .unwrap();
        let moved = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        for task in &moved.items {
            assert_eq!(task.project_id.as_deref(), Some(personal.as_str()));
        }
    }

    #[test]
    fn update_task_can_attach_orphan_as_major() {
        let conn = test_db();
        let main = create_task(&conn, task_input("主任务")).unwrap();
        let orphan = create_task(&conn, task_input("待挂载")).unwrap();
        let updated = update_task(
            &conn,
            &orphan.id,
            TaskUpdateInput {
                task_kind: Some(TaskKind::Major),
                parent_id: Some(Some(main.id.clone())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.task_kind, TaskKind::Major);
        assert_eq!(updated.parent_id.as_deref(), Some(main.id.as_str()));
    }

    #[test]
    fn update_task_rejects_incompatible_existing_children() {
        let conn = test_db();
        let main = create_task(
            &conn,
            TaskCreateInput {
                title: "主任务".into(),
                children: vec![TaskCreateInput {
                    title: "大任务".into(),
                    task_kind: TaskKind::Major,
                    ..Default::default()
                }],
                ..Default::default()
            },
        )
        .unwrap();
        let result = update_task(
            &conn,
            &main.id,
            TaskUpdateInput {
                task_kind: Some(TaskKind::Major),
                ..Default::default()
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn archive_and_delete_cascade_to_descendants() {
        let conn = test_db();
        let main = create_task(
            &conn,
            TaskCreateInput {
                title: "级联主任务".into(),
                children: vec![TaskCreateInput {
                    title: "级联大任务".into(),
                    task_kind: TaskKind::Major,
                    children: vec![TaskCreateInput {
                        title: "级联小任务".into(),
                        task_kind: TaskKind::Minor,
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
                ..Default::default()
            },
        )
        .unwrap();

        archive_task(&conn, &main.id).unwrap();
        let archived = list_tasks(
            &conn,
            TaskFilter {
                include_archived: true,
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(archived.total, 3);
        assert!(archived.items.iter().all(|task| task.archived_at.is_some()));

        unarchive_task(&conn, &main.id).unwrap();
        let unarchived =
            list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        assert_eq!(unarchived.total, 3);
        assert!(unarchived
            .items
            .iter()
            .all(|task| task.archived_at.is_none()));

        soft_delete_task(&conn, &main.id).unwrap();
        let deleted = list_tasks(
            &conn,
            TaskFilter {
                include_deleted: true,
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(deleted.total, 3);
        assert!(deleted.items.iter().all(|task| task.deleted_at.is_some()));

        restore_task(&conn, &main.id).unwrap();
        let restored =
            list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        assert_eq!(restored.total, 3);
        assert!(restored.items.iter().all(|task| task.deleted_at.is_none()));
    }

    #[test]
    fn task_hierarchy_rejects_invalid_parent() {
        let conn = test_db();
        let main = create_task(&conn, task_input("主任务")).unwrap();
        let invalid = create_task(
            &conn,
            TaskCreateInput {
                title: "错误小任务".into(),
                task_kind: TaskKind::Minor,
                parent_id: Some(main.id.clone()),
                ..Default::default()
            },
        );
        assert!(matches!(invalid, Err(AppError::Validation(_))));

        let self_parent = update_task(
            &conn,
            &main.id,
            TaskUpdateInput {
                parent_id: Some(Some(main.id.clone())),
                ..Default::default()
            },
        );
        assert!(matches!(self_parent, Err(AppError::Validation(_))));
    }

    #[test]
    fn deleted_tasks_are_locked_from_edits() {
        let conn = test_db();
        let task = create_task(&conn, task_input("待删除")).unwrap();
        soft_delete_task(&conn, &task.id).unwrap();
        let result = update_task(
            &conn,
            &task.id,
            TaskUpdateInput {
                title: Some("不应生效".into()),
                ..Default::default()
            },
        );
        assert!(matches!(result, Err(AppError::InvalidState(_))));
        let result = archive_task(&conn, &task.id);
        assert!(matches!(result, Err(AppError::InvalidState(_))));
    }

    #[test]
    fn task_filtering_search_sort_and_pagination() {
        let conn = test_db();
        let work = list_projects(&conn, false)
            .unwrap()
            .into_iter()
            .find(|p| p.name == "工作")
            .unwrap();
        let study = list_projects(&conn, false)
            .unwrap()
            .into_iter()
            .find(|p| p.name == "学习")
            .unwrap();
        let important = list_tags(&conn)
            .unwrap()
            .into_iter()
            .find(|t| t.name == "重要")
            .unwrap();
        let urgent = list_tags(&conn)
            .unwrap()
            .into_iter()
            .find(|t| t.name == "紧急")
            .unwrap();

        let report = create_task(
            &conn,
            TaskCreateInput {
                title: "编写周报".into(),
                due_at: Some("2026-08-10T10:00:00.000Z".into()),
                priority: Priority::High,
                status: TaskStatus::InProgress,
                project_id: Some(work.id.clone()),
                tag_ids: vec![important.id.clone()],
                ..Default::default()
            },
        )
        .unwrap();
        create_task(
            &conn,
            TaskCreateInput {
                title: "整理会议纪要".into(),
                due_at: Some("2026-08-12T10:00:00.000Z".into()),
                priority: Priority::Medium,
                ..Default::default()
            },
        )
        .unwrap();
        let rust = create_task(
            &conn,
            TaskCreateInput {
                title: "学习 Rust".into(),
                notes: Some("所有权与生命周期".into()),
                due_at: Some("2026-08-08T10:00:00.000Z".into()),
                priority: Priority::Low,
                status: TaskStatus::Completed,
                project_id: Some(study.id),
                tag_ids: vec![important.id.clone(), urgent.id],
                ..Default::default()
            },
        )
        .unwrap();

        let all = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        assert_eq!(all.total, 3);

        let by_status = list_tasks(
            &conn,
            TaskFilter {
                statuses: Some(vec![TaskStatus::InProgress]),
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_status.total, 1);
        assert_eq!(by_status.items[0].id, report.id);

        let by_priority = list_tasks(
            &conn,
            TaskFilter {
                priorities: Some(vec![Priority::Medium]),
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_priority.total, 1);

        let by_project = list_tasks(
            &conn,
            TaskFilter {
                project_id: Some(Some(work.id.clone())),
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_project.total, 1);

        let inbox = list_tasks(
            &conn,
            TaskFilter {
                project_id: Some(None),
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(inbox.total, 1);

        let by_tag = list_tasks(
            &conn,
            TaskFilter {
                tag_ids: Some(vec![important.id.clone()]),
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_tag.total, 2);

        let by_due = list_tasks(
            &conn,
            TaskFilter {
                due_from: Some("2026-08-09T00:00:00.000Z".into()),
                due_until: Some("2026-08-13T00:00:00.000Z".into()),
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_due.total, 2);

        let by_query = list_tasks(
            &conn,
            TaskFilter {
                query: Some("生命周期".into()),
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_query.total, 1);
        assert_eq!(by_query.items[0].id, rust.id);

        let by_due_sort = list_tasks(
            &conn,
            TaskFilter::default(),
            TaskSort {
                field: TaskSortField::DueAt,
                direction: TaskSortDirection::Asc,
            },
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_due_sort.items[0].id, rust.id);

        let page = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 2).unwrap();
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.total, 3);

        archive_task(&conn, &report.id).unwrap();
        soft_delete_task(&conn, &rust.id).unwrap();
        let active = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        assert_eq!(active.total, 1);
        let all_including_hidden = list_tasks(
            &conn,
            TaskFilter {
                include_archived: true,
                include_deleted: true,
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(all_including_hidden.total, 3);
    }

    #[test]
    fn create_validates_references() {
        let conn = test_db();
        let result = create_task(
            &conn,
            TaskCreateInput {
                title: "坏引用".into(),
                project_id: Some("missing".into()),
                ..Default::default()
            },
        );
        assert!(matches!(result, Err(AppError::ProjectNotFound(_))));

        let result = create_task(
            &conn,
            TaskCreateInput {
                title: "坏标签".into(),
                tag_ids: vec!["missing".into()],
                ..Default::default()
            },
        );
        assert!(matches!(result, Err(AppError::TagNotFound(_))));

        let result = create_task(&conn, task_input("  "));
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn project_crud_and_archive() {
        let conn = test_db();
        assert_eq!(list_projects(&conn, false).unwrap().len(), 4);

        let created = create_project(
            &conn,
            ProjectCreateInput {
                name: " 家庭  ".into(),
                color: Some("#7C3AED".into()),
                sort_order: 9,
            },
        )
        .unwrap();
        assert_eq!(created.name, "家庭");

        let updated = update_project(
            &conn,
            &created.id,
            ProjectUpdateInput {
                name: Some("家庭生活".into()),
                color: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.name, "家庭生活");
        assert!(updated.color.is_none());

        let task = create_task(
            &conn,
            TaskCreateInput {
                title: "项目任务".into(),
                project_id: Some(created.id.clone()),
                ..Default::default()
            },
        )
        .unwrap();
        archive_project(&conn, &created.id).unwrap();
        assert_eq!(list_projects(&conn, false).unwrap().len(), 4);
        assert_eq!(list_projects(&conn, true).unwrap().len(), 5);
        assert!(get_task(&conn, &task.id)
            .unwrap()
            .unwrap()
            .archived_at
            .is_some());

        update_project(
            &conn,
            &created.id,
            ProjectUpdateInput {
                is_archived: Some(false),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(get_task(&conn, &task.id)
            .unwrap()
            .unwrap()
            .archived_at
            .is_none());

        delete_project(&conn, &created.id).unwrap();
        assert!(get_project(&conn, &created.id).unwrap().is_none());
    }

    #[test]
    fn tag_crud_and_unique_name() {
        let conn = test_db();
        let created = create_tag(
            &conn,
            TagCreateInput {
                name: "客户".into(),
                color: Some("#0EA5E9".into()),
            },
        )
        .unwrap();
        assert_eq!(created.name, "客户");

        let duplicate = create_tag(
            &conn,
            TagCreateInput {
                name: " 客户 ".into(),
                ..Default::default()
            },
        );
        assert!(matches!(duplicate, Err(AppError::Validation(_))));

        update_tag(
            &conn,
            &created.id,
            TagUpdateInput {
                name: Some("重点客户".into()),
                color: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            get_tag(&conn, &created.id).unwrap().unwrap().name,
            "重点客户"
        );

        delete_tag(&conn, &created.id).unwrap();
        assert!(get_tag(&conn, &created.id).unwrap().is_none());
    }

    #[test]
    fn batch_operations_apply_to_active_tasks() {
        let conn = test_db();
        let first = create_task(&conn, task_input("批量任务一")).unwrap();
        let second = create_task(&conn, task_input("批量任务二")).unwrap();
        let work = list_projects(&conn, false)
            .unwrap()
            .into_iter()
            .find(|p| p.name == "工作")
            .unwrap();
        let important = list_tags(&conn)
            .unwrap()
            .into_iter()
            .find(|t| t.name == "重要")
            .unwrap();

        assert_eq!(
            batch_complete_tasks(&conn, &[first.id.clone(), second.id.clone()]).unwrap(),
            2
        );
        assert_eq!(
            get_task(&conn, &first.id).unwrap().unwrap().status,
            TaskStatus::Completed
        );

        assert_eq!(
            batch_set_priority(&conn, &[first.id.clone()], Priority::Urgent).unwrap(),
            1
        );
        assert_eq!(
            get_task(&conn, &first.id).unwrap().unwrap().priority,
            Priority::Urgent
        );

        assert_eq!(
            batch_set_project(&conn, &[first.id.clone()], Some(work.id.clone())).unwrap(),
            1
        );
        assert_eq!(
            get_task(&conn, &first.id)
                .unwrap()
                .unwrap()
                .project_id
                .as_deref(),
            Some(work.id.as_str())
        );

        assert_eq!(
            batch_add_tags(&conn, &[first.id.clone()], &[important.id]).unwrap(),
            1
        );
        assert!(!get_task(&conn, &first.id)
            .unwrap()
            .unwrap()
            .tag_ids
            .is_empty());

        batch_soft_delete_tasks(&conn, &[first.id.clone(), second.id]).unwrap();
        assert_eq!(clear_trash(&conn).unwrap(), 2);
        assert!(get_task(&conn, &first.id).unwrap().is_none());
    }

    #[test]
    fn due_reminders_only_include_active_upcoming_tasks() {
        let conn = test_db();
        let due = create_task(
            &conn,
            TaskCreateInput {
                title: "应提醒".into(),
                due_at: Some("2026-08-10T10:00:00.000Z".into()),
                ..Default::default()
            },
        )
        .unwrap();
        create_task(
            &conn,
            TaskCreateInput {
                title: "已完成不提醒".into(),
                due_at: Some("2026-08-10T10:00:00.000Z".into()),
                status: TaskStatus::Completed,
                ..Default::default()
            },
        )
        .unwrap();
        let archived = create_task(
            &conn,
            TaskCreateInput {
                title: "归档不提醒".into(),
                due_at: Some("2026-08-10T10:00:00.000Z".into()),
                ..Default::default()
            },
        )
        .unwrap();
        archive_task(&conn, &archived.id).unwrap();
        let deleted = create_task(
            &conn,
            TaskCreateInput {
                title: "回收站不提醒".into(),
                due_at: Some("2026-08-10T10:00:00.000Z".into()),
                ..Default::default()
            },
        )
        .unwrap();
        soft_delete_task(&conn, &deleted.id).unwrap();

        let reminders = list_due_reminders(&conn, "2026-08-10T11:00:00.000Z", 100).unwrap();
        assert_eq!(reminders.len(), 1);
        assert_eq!(reminders[0].id, due.id);
    }

    #[test]
    fn batch_restore_and_hard_delete_trash_tasks() {
        let conn = test_db();
        let first = create_task(&conn, task_input("恢复一")).unwrap();
        let second = create_task(&conn, task_input("恢复二")).unwrap();
        batch_soft_delete_tasks(&conn, &[first.id.clone(), second.id.clone()]).unwrap();
        assert_eq!(
            list_tasks(
                &conn,
                TaskFilter {
                    include_deleted: true,
                    ..Default::default()
                },
                TaskSort::default(),
                0,
                100,
            )
            .unwrap()
            .total,
            2
        );

        assert_eq!(batch_restore_tasks(&conn, &[first.id.clone()]).unwrap(), 1);
        assert!(get_task(&conn, &first.id)
            .unwrap()
            .unwrap()
            .deleted_at
            .is_none());
        assert!(get_task(&conn, &second.id)
            .unwrap()
            .unwrap()
            .deleted_at
            .is_some());

        assert_eq!(
            batch_hard_delete_tasks(&conn, &[second.id.clone()]).unwrap(),
            1
        );
        assert!(get_task(&conn, &second.id).unwrap().is_none());
    }

    #[test]
    fn settings_defaults_and_update() {
        let conn = test_db();
        let defaults = get_settings(&conn).unwrap();
        assert_eq!(defaults.theme, ThemeMode::System);
        assert_eq!(defaults.language, "zh-CN");
        assert!(defaults.reminders_enabled);
        assert_eq!(defaults.remind_minutes, 15);
        assert_eq!(defaults.backup_interval_hours, Some(24));

        update_settings(
            &conn,
            SettingsPatch {
                theme: Some(ThemeMode::Dark),
                reminders_enabled: Some(false),
                remind_minutes: Some(30),
                backup_interval_hours: Some(None),
                data_directory: Some(Some("D:\\data".into())),
                ..Default::default()
            },
        )
        .unwrap();

        let updated = get_settings(&conn).unwrap();
        assert_eq!(updated.theme, ThemeMode::Dark);
        assert!(!updated.reminders_enabled);
        assert_eq!(updated.remind_minutes, 30);
        assert!(updated.backup_interval_hours.is_none());
        assert_eq!(updated.data_directory.as_deref(), Some("D:\\data"));
    }

    #[test]
    #[ignore]
    fn performance_10k_tasks() {
        let dir = std::env::temp_dir().join(format!("task-manager-bench-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("task-manager.db");

        let seeded = (|| -> Result<(), AppError> {
            let conn = db::open_connection(&db_path)?;
            db::migrate(&conn)?;
            db::seed_defaults(&conn)?;
            let tx = conn.unchecked_transaction()?;
            let timestamp = now_iso();
            for index in 0..10_000 {
                tx.execute(
                    "INSERT INTO tasks
                       (id, title, notes, due_at, priority, status, project_id, sort_order,
                        created_at, updated_at, schema_version)
                     VALUES (?1, ?2, '', ?3, 'none', 'todo', NULL, ?4, ?5, ?5, 2)",
                    params![
                        format!("bench-{index}"),
                        format!("任务 {index:05}"),
                        if index % 50 == 0 {
                            Some(format!("2026-08-{}.000Z", 1 + (index % 28)))
                        } else {
                            None
                        },
                        index,
                        timestamp,
                    ],
                )?;
            }
            tx.commit()?;
            Ok(())
        })();
        seeded.unwrap();

        let startup = Instant::now();
        let conn = db::open_connection(&db_path).unwrap();
        db::migrate(&conn).unwrap();
        let startup_ms = startup.elapsed().as_millis();

        let search = Instant::now();
        let page = list_tasks(
            &conn,
            TaskFilter {
                query: Some("任务 09999".into()),
                ..Default::default()
            },
            TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        let search_ms = search.elapsed().as_millis();
        assert_eq!(page.total, 1);

        let list = Instant::now();
        let page = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 1000).unwrap();
        let list_ms = list.elapsed().as_millis();
        assert_eq!(page.items.len(), 1000);

        println!(
            "PERF startup={startup_ms}ms search={search_ms}ms list1000={list_ms}ms total=10000"
        );

        drop(conn);
        std::fs::remove_dir_all(&dir).unwrap();
        assert!(startup_ms < 3000, "启动耗时 {startup_ms}ms 超过 3s");
        assert!(search_ms < 200, "搜索耗时 {search_ms}ms 超过 200ms");
        assert!(list_ms < 200, "列表 1000 条耗时 {list_ms}ms 超过 200ms");
    }

    #[test]
    fn completing_recurring_main_clones_children_and_schedules_next() {
        let conn = test_db();
        let main = create_task(
            &conn,
            TaskCreateInput {
                title: "每周复盘".into(),
                due_at: Some("2030-01-02T09:00:00.000Z".into()),
                repeat_frequency: RepeatFrequency::Weekly,
                repeat_interval: 1,
                children: vec![TaskCreateInput {
                    title: "写总结".into(),
                    task_kind: TaskKind::Major,
                    ..Default::default()
                }],
                ..Default::default()
            },
        )
        .unwrap();

        transition_task_status(&conn, &main.id, TaskStatus::Completed).unwrap();

        let active = list_tasks(&conn, TaskFilter::default(), TaskSort::default(), 0, 100).unwrap();
        let next = active
            .items
            .iter()
            .find(|task| task.id != main.id && task.task_kind == TaskKind::Main)
            .expect("应生成下一次周期任务");
        assert_eq!(next.repeat_frequency, RepeatFrequency::Weekly);
        assert!(next.due_at.as_deref().unwrap() > "2030-01-02T09:00:00.000Z");
        assert!(active
            .items
            .iter()
            .any(|task| task.parent_id.as_deref() == Some(next.id.as_str())));
    }

    #[test]
    fn repeat_is_only_allowed_on_main_tasks() {
        let conn = test_db();
        let main = create_task(&conn, task_input("主任务")).unwrap();
        let result = create_task(
            &conn,
            TaskCreateInput {
                title: "大任务".into(),
                task_kind: TaskKind::Major,
                parent_id: Some(main.id.clone()),
                repeat_frequency: RepeatFrequency::Daily,
                repeat_interval: 1,
                ..Default::default()
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
    }
}
