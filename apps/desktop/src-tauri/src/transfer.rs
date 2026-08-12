use crate::error::AppError;
use crate::models::{
    now_iso, BackupPayload, ExportResult, ImportResult, Priority, ProjectCreateInput,
    RepeatFrequency, Settings, TagCreateInput, TaskCreateInput, TaskResourceInput, TaskStatus,
};
use crate::{attachments, collaboration, library, repositories, templates};
use calamine::Reader;
use rusqlite::Connection;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub fn export_json(conn: &Connection, path: &Path) -> Result<ExportResult, AppError> {
    let payload = build_payload(conn)?;
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| AppError::Backup(format!("JSON 序列化失败：{e}")))?;
    fs::write(path, json)?;
    Ok(ExportResult {
        path: path.display().to_string(),
        count: payload.tasks.len(),
        format: "json".to_string(),
    })
}

pub fn import_json(
    conn: &Connection,
    path: &Path,
    replace: bool,
) -> Result<ImportResult, AppError> {
    let text = fs::read_to_string(path)?;
    import_json_text(conn, &text, replace)
}

pub fn import_json_text(
    conn: &Connection,
    text: &str,
    replace: bool,
) -> Result<ImportResult, AppError> {
    let payload: BackupPayload =
        serde_json::from_str(text).map_err(|e| AppError::Import(format!("JSON 格式无效：{e}")))?;
    import_payload(conn, &payload, replace)
}

pub fn export_csv(conn: &Connection, path: &Path) -> Result<ExportResult, AppError> {
    let (rows, count) = export_rows(conn)?;
    let mut csv = String::from("\u{feff}");
    for (index, row) in rows.iter().enumerate() {
        if index > 0 {
            csv.push('\n');
        }
        csv.push_str(
            &row.iter()
                .map(|value| csv_field(value))
                .collect::<Vec<_>>()
                .join(","),
        );
    }
    fs::write(path, csv)?;
    Ok(ExportResult {
        path: path.display().to_string(),
        count,
        format: "csv".to_string(),
    })
}
pub fn build_payload(conn: &Connection) -> Result<BackupPayload, AppError> {
    let projects = repositories::list_projects(conn, true)?;
    let tags = repositories::list_tags(conn)?;
    let tasks = repositories::list_tasks(
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
    let settings = repositories::get_settings(conn)?;
    let templates = templates::list_task_templates(conn)?;
    let comments = collaboration::list_all_task_comments(conn)?;
    let members = collaboration::list_all_project_members(conn)?;
    let library_resources = library::list_library(conn)?;
    let attachments = attachments::list_all_attachments(conn)?;
    Ok(BackupPayload {
        schema_version: crate::db::SCHEMA_VERSION,
        exported_at: now_iso(),
        projects,
        tags,
        tasks,
        settings: Some(settings),
        templates,
        comments,
        members,
        library_resources,
        attachments,
    })
}

pub fn import_payload(
    conn: &Connection,
    payload: &BackupPayload,
    replace: bool,
) -> Result<ImportResult, AppError> {
    for task in &payload.tasks {
        if task.title.trim().is_empty() {
            return Err(AppError::Import(format!(
                "任务 ID {} 的标题不能为空",
                task.id
            )));
        }
    }

    let tx = conn.unchecked_transaction()?;
    if replace {
        tx.execute("DELETE FROM task_tags", [])?;
        tx.execute("DELETE FROM tasks", [])?;
        tx.execute("DELETE FROM tags", [])?;
        tx.execute("DELETE FROM projects", [])?;
        tx.execute("DELETE FROM task_comments", [])?;
        tx.execute("DELETE FROM project_members", [])?;
        tx.execute("DELETE FROM task_attachments", [])?;
        tx.execute("DELETE FROM library_resources", [])?;
        tx.execute("DELETE FROM task_templates", [])?;
    }

    for project in &payload.projects {
        tx.execute(
            "INSERT OR IGNORE INTO projects
               (id, name, color, sort_order, is_archived, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                project.id,
                project.name.trim(),
                project.color,
                project.sort_order,
                project.is_archived,
                project.created_at,
                project.updated_at
            ],
        )?;
    }
    for tag in &payload.tags {
        tx.execute(
            "INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![tag.id, tag.name.trim(), tag.color, tag.created_at],
        )?;
    }

    let mut imported_tasks = 0;
    for task in &payload.tasks {
        let project_id = task
            .project_id
            .as_ref()
            .filter(|id| project_exists(&tx, id))
            .cloned();
        let valid_tag_ids: Vec<String> = task
            .tag_ids
            .iter()
            .filter(|id| tag_exists(&tx, id))
            .cloned()
            .collect();
        let changed = tx.execute(
                        "INSERT OR IGNORE INTO tasks
               (id, title, notes, due_at, repeat_frequency, repeat_interval, repeat_end_at,
                assignee, department, start_at, done_criteria, budget,
                priority, status, project_id, task_kind, sort_order,
                archived_at, created_at, updated_at, completed_at, deleted_at, schema_version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
                        rusqlite::params![
                task.id,
                task.title.trim(),
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
                task.status,
                project_id,
                task.task_kind,
                task.sort_order,
                task.archived_at,
                task.created_at,
                task.updated_at,
                task.completed_at,
                task.deleted_at,
                task.schema_version
            ],
        )?;
        if changed == 1 {
            repositories::replace_task_tags(&tx, &task.id, &valid_tag_ids)?;
            let resources: Vec<TaskResourceInput> = task
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
                .collect();
            repositories::replace_task_resources(&tx, &task.id, &resources)?;
            imported_tasks += 1;
        }
    }

    for task in &payload.tasks {
        if let Some(parent_id) = &task.parent_id {
            let parent_exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?)",
                    rusqlite::params![parent_id],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if parent_exists {
                tx.execute(
                    "UPDATE tasks SET parent_id = ? WHERE id = ?",
                    rusqlite::params![parent_id, task.id],
                )?;
            }
        }
    }

    for template in &payload.templates {
        let tasks_json = serde_json::to_string(&template.tasks)
            .map_err(|e| AppError::Import(format!("模板数据序列化失败：{e}")))?;
        tx.execute(
            "INSERT OR IGNORE INTO task_templates
               (id, name, project_id, tasks_json, created_at, updated_at)
             VALUES (?1, ?2, NULL, ?3, ?4, ?4)",
            rusqlite::params![
                template.id,
                template.name.trim(),
                tasks_json,
                template.created_at
            ],
        )?;
    }

    for comment in &payload.comments {
        let task_exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?)",
                rusqlite::params![comment.task_id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if task_exists {
            tx.execute(
                "INSERT OR IGNORE INTO task_comments
                   (id, task_id, author, content, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    comment.id,
                    comment.task_id,
                    comment.author,
                    comment.content,
                    comment.created_at,
                    comment.updated_at
                ],
            )?;
        }
    }

    for member in &payload.members {
        let project_exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?)",
                rusqlite::params![member.project_id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if project_exists {
            tx.execute(
                "INSERT OR IGNORE INTO project_members
                   (id, project_id, name, email, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    member.id,
                    member.project_id,
                    member.name,
                    member.email,
                    member.role,
                    member.created_at
                ],
            )?;
        }
    }

    if let Some(settings) = &payload.settings {
        apply_settings(&tx, settings)?;
    }
    tx.commit()?;

    Ok(ImportResult {
        projects: payload.projects.len(),
        tags: payload.tags.len(),
        tasks: imported_tasks,
    })
}

fn project_exists(conn: &Connection, id: &str) -> bool {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?)",
        rusqlite::params![id],
        |row| row.get::<_, bool>(0),
    )
    .unwrap_or(false)
}

fn tag_exists(conn: &Connection, id: &str) -> bool {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM tags WHERE id = ?)",
        rusqlite::params![id],
        |row| row.get::<_, bool>(0),
    )
    .unwrap_or(false)
}

fn apply_settings(conn: &Connection, settings: &Settings) -> Result<(), AppError> {
    let theme = serde_json::to_string(&settings.theme)
        .map_err(|e| AppError::Import(format!("主题设置格式无效：{e}")))?;
    let language = serde_json::to_string(&settings.language)
        .map_err(|e| AppError::Import(format!("语言设置格式无效：{e}")))?;
    let reminders = serde_json::to_string(&settings.reminders_enabled)
        .map_err(|e| AppError::Import(format!("提醒设置格式无效：{e}")))?;
    let remind_minutes = serde_json::to_string(&settings.remind_minutes)
        .map_err(|e| AppError::Import(format!("提醒时间设置格式无效：{e}")))?;
    let backup_interval = serde_json::to_string(&settings.backup_interval_hours)
        .map_err(|e| AppError::Import(format!("备份设置格式无效：{e}")))?;
    let data_directory = serde_json::to_string(&settings.data_directory)
        .map_err(|e| AppError::Import(format!("数据目录设置格式无效：{e}")))?;
    let last_backup = serde_json::to_string(&settings.last_backup_at)
        .map_err(|e| AppError::Import(format!("备份时间设置格式无效：{e}")))?;

    repositories::upsert_setting(conn, "theme", &theme)?;
    repositories::upsert_setting(conn, "language", &language)?;
    repositories::upsert_setting(conn, "reminders_enabled", &reminders)?;
    repositories::upsert_setting(conn, "remind_minutes", &remind_minutes)?;
    repositories::upsert_setting(conn, "backup_interval_hours", &backup_interval)?;
    repositories::upsert_setting(conn, "data_directory", &data_directory)?;
    repositories::upsert_setting(conn, "last_backup_at", &last_backup)?;
    Ok(())
}

fn csv_field(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn export_rows(conn: &Connection) -> Result<(Vec<Vec<String>>, usize), AppError> {
    let tasks = repositories::list_tasks(
        conn,
        crate::models::TaskFilter {
            include_archived: true,
            ..Default::default()
        },
        crate::models::TaskSort::default(),
        0,
        100_000,
    )?
    .items;
    let projects = repositories::list_projects(conn, true)?;
    let tags = repositories::list_tags(conn)?;
    let project_names: HashMap<String, String> = projects
        .into_iter()
        .map(|project| (project.id, project.name))
        .collect();
    let tag_names: HashMap<String, String> =
        tags.into_iter().map(|tag| (tag.id, tag.name)).collect();

    let mut rows = vec![vec![
        "ID".to_string(),
        "标题".to_string(),
        "备注".to_string(),
        "负责人".to_string(),
        "部门".to_string(),
        "开始时间".to_string(),
        "截止时间".to_string(),
        "重复".to_string(),
        "间隔".to_string(),
        "重复截止".to_string(),
        "优先级".to_string(),
        "状态".to_string(),
        "项目".to_string(),
        "标签".to_string(),
        "任务层级".to_string(),
        "父任务ID".to_string(),
        "完成标准".to_string(),
        "预算".to_string(),
        "创建时间".to_string(),
        "更新时间".to_string(),
        "完成时间".to_string(),
    ]];
    for task in &tasks {
        let tags = task
            .tag_ids
            .iter()
            .filter_map(|id| tag_names.get(id))
            .cloned()
            .collect::<Vec<_>>()
            .join(";");
        let project = task
            .project_id
            .as_ref()
            .and_then(|id| project_names.get(id))
            .map(String::as_str)
            .unwrap_or("收件箱");
        rows.push(vec![
            task.id.clone(),
            task.title.clone(),
            task.notes.clone(),
            task.assignee.clone().unwrap_or_default(),
            task.department.clone().unwrap_or_default(),
            task.start_at.clone().unwrap_or_default(),
            task.due_at.clone().unwrap_or_default(),
            task.repeat_frequency.as_str().to_string(),
            task.repeat_interval.to_string(),
            task.repeat_end_at.clone().unwrap_or_default(),
            task.priority.as_str().to_string(),
            task.status.as_str().to_string(),
            project.to_string(),
            tags,
            task.task_kind.as_str().to_string(),
            task.parent_id.clone().unwrap_or_default(),
            task.done_criteria.clone().unwrap_or_default(),
            task.budget.clone().unwrap_or_default(),
            task.created_at.clone(),
            task.updated_at.clone(),
            task.completed_at.clone().unwrap_or_default(),
        ]);
    }
    let count = tasks.len();
    Ok((rows, count))
}

pub fn export_excel(conn: &Connection, path: &Path) -> Result<ExportResult, AppError> {
    let (rows, count) = export_rows(conn)?;
    let mut workbook = rust_xlsxwriter::Workbook::new();
    let worksheet = workbook.add_worksheet();
    for (row_index, row) in rows.iter().enumerate() {
        for (col_index, value) in row.iter().enumerate() {
            worksheet
                .write_string(row_index as u32, col_index as u16, value.as_str())
                .map_err(|e| AppError::Import(format!("Excel 写入失败：{e}")))?;
        }
    }
    workbook
        .save(path)
        .map_err(|e| AppError::Import(format!("Excel 保存失败：{e}")))?;
    Ok(ExportResult {
        path: path.display().to_string(),
        count,
        format: "excel".to_string(),
    })
}

fn cell_to_string(cell: &calamine::Data) -> String {
    match cell {
        calamine::Data::Empty => String::new(),
        calamine::Data::String(value) => value.clone(),
        calamine::Data::Int(value) => value.to_string(),
        calamine::Data::Float(value) => value.to_string(),
        calamine::Data::Bool(value) => value.to_string(),
        calamine::Data::DateTime(value) => value.to_string(),
        calamine::Data::Error(value) => value.to_string(),
        _ => String::new(),
    }
}

fn parse_priority(value: &str) -> Result<Priority, AppError> {
    match value.trim().to_lowercase().as_str() {
        "none" | "无" => Ok(Priority::None),
        "low" | "低" => Ok(Priority::Low),
        "medium" | "中" => Ok(Priority::Medium),
        "high" | "高" => Ok(Priority::High),
        "urgent" | "紧急" => Ok(Priority::Urgent),
        _ => Err(AppError::Import(format!("未知优先级：{value}"))),
    }
}

fn parse_status(value: &str) -> Result<TaskStatus, AppError> {
    match value.trim().to_lowercase().as_str() {
        "todo" | "待办" => Ok(TaskStatus::Todo),
        "in_progress" | "进行中" => Ok(TaskStatus::InProgress),
        "completed" | "已完成" => Ok(TaskStatus::Completed),
        "cancelled" | "已取消" => Ok(TaskStatus::Cancelled),
        _ => Err(AppError::Import(format!("未知任务状态：{value}"))),
    }
}

fn parse_repeat(value: &str) -> Result<RepeatFrequency, AppError> {
    match value.trim().to_lowercase().as_str() {
        "" | "none" | "不重复" => Ok(RepeatFrequency::None),
        "daily" | "每天" => Ok(RepeatFrequency::Daily),
        "weekly" | "每周" => Ok(RepeatFrequency::Weekly),
        "monthly" | "每月" => Ok(RepeatFrequency::Monthly),
        "custom" | "自定义" => Ok(RepeatFrequency::Custom),
        _ => Err(AppError::Import(format!("未知重复频率：{value}"))),
    }
}

fn normalize_header(value: &str) -> String {
    value.trim().to_lowercase().replace([' ', '_', '-'], "")
}

fn field<'a>(
    row: &'a [String],
    headers: &HashMap<String, usize>,
    names: &[&str],
) -> Option<&'a str> {
    for name in names {
        if let Some(&index) = headers.get(&normalize_header(name)) {
            let value = row.get(index).map(String::as_str).unwrap_or("").trim();
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn import_rows(conn: &Connection, rows: &[Vec<String>]) -> Result<ImportResult, AppError> {
    if rows.is_empty() {
        return Ok(ImportResult {
            projects: 0,
            tags: 0,
            tasks: 0,
        });
    }
    let headers = rows[0]
        .iter()
        .enumerate()
        .map(|(index, name)| (normalize_header(name), index))
        .collect::<HashMap<_, _>>();
    let mut projects = repositories::list_projects(conn, true)?;
    let mut tags = repositories::list_tags(conn)?;
    let mut imported_projects = 0;
    let mut imported_tags = 0;
    let mut imported_tasks = 0;

    for row in rows.iter().skip(1) {
        let Some(title) = field(row, &headers, &["标题", "title"]) else {
            continue;
        };
        let project_name = field(row, &headers, &["项目", "project"]);
        let project_id = match project_name {
            None | Some("收件箱") => None,
            Some(name) => {
                let name = name.trim();
                let existing = projects
                    .iter()
                    .find(|project| project.name.eq_ignore_ascii_case(name))
                    .map(|project| project.id.clone());
                match existing {
                    Some(id) => Some(id),
                    None => {
                        let created = repositories::create_project(
                            conn,
                            ProjectCreateInput {
                                name: name.to_string(),
                                color: None,
                                sort_order: projects.len() as i64,
                            },
                        )?;
                        imported_projects += 1;
                        projects.push(created.clone());
                        Some(created.id)
                    }
                }
            }
        };

        let tag_names = field(row, &headers, &["标签", "tags"])
            .map(|value| {
                value
                    .split([';', '，', ','])
                    .map(str::trim)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let mut tag_ids = Vec::new();
        for name in tag_names {
            if name.is_empty() {
                continue;
            }
            if let Some(existing) = tags.iter().find(|tag| tag.name.eq_ignore_ascii_case(name)) {
                tag_ids.push(existing.id.clone());
            } else {
                let created = repositories::create_tag(
                    conn,
                    TagCreateInput {
                        name: name.to_string(),
                        color: None,
                    },
                )?;
                imported_tags += 1;
                tags.push(created.clone());
                tag_ids.push(created.id);
            }
        }

        let notes = field(row, &headers, &["备注", "notes"])
            .unwrap_or("")
            .to_string();
        let assignee = field(row, &headers, &["负责人", "assignee"]).map(str::to_string);
        let department = field(row, &headers, &["部门", "department"]).map(str::to_string);
        let start_at = field(row, &headers, &["开始时间", "startat"]).map(str::to_string);
        let due_at = field(row, &headers, &["截止时间", "dueat"]).map(str::to_string);
        let repeat_end_at = field(row, &headers, &["重复截止", "repeatendat"]).map(str::to_string);
        let done_criteria = field(row, &headers, &["完成标准", "donecriteria"]).map(str::to_string);
        let budget = field(row, &headers, &["预算", "budget"]).map(str::to_string);
        let priority =
            parse_priority(field(row, &headers, &["优先级", "priority"]).unwrap_or("none"))?;
        let status = parse_status(field(row, &headers, &["状态", "status"]).unwrap_or("todo"))?;
        let repeat_frequency =
            parse_repeat(field(row, &headers, &["重复", "repeat"]).unwrap_or("none"))?;
        let repeat_interval = field(row, &headers, &["间隔", "interval"])
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(1);

        repositories::create_task(
            conn,
            TaskCreateInput {
                title: title.to_string(),
                notes: Some(notes),
                due_at,
                repeat_frequency,
                repeat_interval,
                repeat_end_at,
                assignee,
                department,
                start_at,
                done_criteria,
                budget,
                priority,
                status,
                project_id,
                tag_ids,
                ..Default::default()
            },
        )?;
        imported_tasks += 1;
    }

    Ok(ImportResult {
        projects: imported_projects,
        tags: imported_tags,
        tasks: imported_tasks,
    })
}

pub fn import_excel(conn: &Connection, path: &Path) -> Result<ImportResult, AppError> {
    let mut workbook: calamine::Xlsx<_> = calamine::open_workbook(path)
        .map_err(|e| AppError::Import(format!("无法打开 Excel 文件：{e}")))?;
    let range = workbook
        .worksheet_range_at(0)
        .ok_or_else(|| AppError::Import("Excel 文件中没有工作表".to_string()))?
        .map_err(|e| AppError::Import(format!("读取 Excel 失败：{e}")))?;
    let rows = range
        .rows()
        .map(|row| row.iter().map(cell_to_string).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    import_rows(conn, &rows)
}

pub fn import_csv(conn: &Connection, path: &Path) -> Result<ImportResult, AppError> {
    let mut reader = csv::ReaderBuilder::new()
        .from_path(path)
        .map_err(|e| AppError::Import(format!("无法打开 CSV 文件：{e}")))?;
    let headers = reader
        .headers()
        .map_err(|e| AppError::Import(format!("读取 CSV 表头失败：{e}")))?
        .clone();
    let mut rows = vec![headers
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()];
    for record in reader.records() {
        let record = record.map_err(|e| AppError::Import(format!("读取 CSV 记录失败：{e}")))?;
        rows.push(
            record
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
        );
    }
    import_rows(conn, &rows)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::TaskCreateInput;
    use uuid::Uuid;

    fn test_db() -> Connection {
        let conn = db::open_in_memory().expect("open in-memory db");
        db::migrate(&conn).expect("migrate");
        db::seed_defaults(&conn).expect("seed defaults");
        conn
    }

    #[test]
    fn json_export_and_replace_import_roundtrip() {
        let conn = test_db();
        repositories::create_task(
            &conn,
            TaskCreateInput {
                title: "备份任务".into(),
                ..Default::default()
            },
        )
        .unwrap();

        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("task-manager-backup.json");
        export_json(&conn, &path).unwrap();

        let restored = test_db();
        let result = import_json(&restored, &path, true).unwrap();
        assert_eq!(result.tasks, 1);

        let all = repositories::list_tasks(
            &restored,
            crate::models::TaskFilter::default(),
            crate::models::TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(all.total, 1);
        assert_eq!(all.items[0].title, "备份任务");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn csv_export_and_import_roundtrip() {
        let conn = test_db();
        repositories::create_task(
            &conn,
            TaskCreateInput {
                title: "CSV 任务".into(),
                assignee: Some("张三".into()),
                department: Some("产品部".into()),
                budget: Some("1000".into()),
                ..Default::default()
            },
        )
        .unwrap();

        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tasks.csv");
        export_csv(&conn, &path).unwrap();

        let restored = test_db();
        let result = import_csv(&restored, &path).unwrap();
        assert_eq!(result.tasks, 1);

        let all = repositories::list_tasks(
            &restored,
            crate::models::TaskFilter::default(),
            crate::models::TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(all.items[0].title, "CSV 任务");
        assert_eq!(all.items[0].assignee.as_deref(), Some("张三"));
        assert_eq!(all.items[0].department.as_deref(), Some("产品部"));
        assert_eq!(all.items[0].budget.as_deref(), Some("1000"));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn excel_export_and_import_roundtrip() {
        let conn = test_db();
        repositories::create_task(
            &conn,
            TaskCreateInput {
                title: "Excel 任务".into(),
                assignee: Some("李四".into()),
                department: Some("研发部".into()),
                ..Default::default()
            },
        )
        .unwrap();

        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tasks.xlsx");
        export_excel(&conn, &path).unwrap();

        let restored = test_db();
        let result = import_excel(&restored, &path).unwrap();
        assert_eq!(result.tasks, 1);

        let all = repositories::list_tasks(
            &restored,
            crate::models::TaskFilter::default(),
            crate::models::TaskSort::default(),
            0,
            100,
        )
        .unwrap();
        assert_eq!(all.items[0].title, "Excel 任务");
        assert_eq!(all.items[0].assignee.as_deref(), Some("李四"));
        assert_eq!(all.items[0].department.as_deref(), Some("研发部"));

        std::fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn import_rejects_invalid_json() {
        let conn = test_db();
        let result = import_json_text(&conn, "{not-json", false);
        assert!(matches!(result, Err(AppError::Import(_))));
    }
}
