use crate::repositories;
use rusqlite::Connection;
use std::path::Path;
use tauri_plugin_notification::NotificationExt;

#[cfg(windows)]
use windows::{
    core::{Interface, BSTR},
    Win32::{
        Foundation::{VARIANT_FALSE, VARIANT_TRUE},
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
            },
            Diagnostics::Debug::MessageBeep,
            TaskScheduler::{
                IExecAction, ITaskService, ITimeTrigger, TaskScheduler, TASK_ACTION_EXEC,
                TASK_CREATE_OR_UPDATE, TASK_LOGON_INTERACTIVE_TOKEN, TASK_RUNLEVEL_LUA,
                TASK_TRIGGER_TIME,
            },
            Variant::VARIANT,
        },
        UI::WindowsAndMessaging::MESSAGEBOX_STYLE,
    },
};

const SCHEDULED_TASK_NAME: &str = "TaskCrate-ReminderCheck";

pub fn check_due_reminders(
    handle: &tauri::AppHandle,
    data_dir: &Path,
    conn: &Connection,
) -> Result<usize, String> {
    let settings = repositories::get_settings(conn).map_err(|e| e.to_string())?;
    if !settings.reminders_enabled {
        return Ok(0);
    }
    let targets = crate::secrets::webhook_targets(data_dir).unwrap_or_default();
    let until = (chrono::Utc::now() + chrono::Duration::minutes(settings.remind_minutes.max(1)))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let tasks = repositories::list_due_reminders(conn, &until, 100).map_err(|e| e.to_string())?;
    let now = crate::models::now_iso();
    let mut count = 0;
    for task in tasks {
        let already: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM reminder_events WHERE task_id = ?)",
                rusqlite::params![task.id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if already {
            continue;
        }
        conn.execute(
            "INSERT OR IGNORE INTO reminder_events (task_id, reminded_at) VALUES (?1, ?2)",
            rusqlite::params![task.id, now],
        )
        .map_err(|e| e.to_string())?;
        let due = task.due_at.as_deref().unwrap_or("未设置");
        let _ = handle
            .notification()
            .builder()
            .title("任务到期提醒")
            .body(format!("{} · 截止 {due}", task.title))
            .show();
        if settings.reminder_sound_enabled {
            play_reminder_sound();
        }
        let _ = crate::notify::send_webhook(
            &targets,
            "任务到期提醒",
            &format!("{} · 截止 {due}", task.title),
        );
        count += 1;
    }
    Ok(count)
}

#[cfg(windows)]
pub fn play_reminder_sound() {
    let _ = unsafe { MessageBeep(MESSAGEBOX_STYLE(0)) };
}

#[cfg(not(windows))]
pub fn play_reminder_sound() {}

#[cfg(windows)]
pub fn register_scheduled_reminders(enabled: bool) -> Result<String, String> {
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        let result = register_scheduled_reminders_inner(enabled);
        if hr.0 == 0 {
            CoUninitialize();
        }
        result
    }
}

#[cfg(windows)]
fn register_scheduled_reminders_inner(enabled: bool) -> Result<String, String> {
    unsafe {
        let service: ITaskService = CoCreateInstance(&TaskScheduler, None, CLSCTX_ALL)
            .map_err(|e| format!("无法初始化计划任务服务：{e}"))?;
        let empty = VARIANT::default();
        service
            .Connect(&empty, &empty, &empty, &empty)
            .map_err(|e| format!("无法连接计划任务服务：{e}"))?;
        let root = service
            .GetFolder(&BSTR::from("\\"))
            .map_err(|e| format!("无法打开计划任务目录：{e}"))?;

        if !enabled {
            let _ = root.DeleteTask(&BSTR::from(SCHEDULED_TASK_NAME), 0);
            return Ok("已关闭后台提醒任务".to_string());
        }

        let definition = service
            .NewTask(0)
            .map_err(|e| format!("无法创建计划任务定义：{e}"))?;
        let registration = definition
            .RegistrationInfo()
            .map_err(|e| format!("无法创建任务信息：{e}"))?;
        registration
            .SetAuthor(&BSTR::from("TaskCrate"))
            .map_err(|e| format!("无法写入任务作者：{e}"))?;
        registration
            .SetDescription(&BSTR::from("TaskCrate reminder check"))
            .map_err(|e| format!("无法写入任务描述：{e}"))?;

        let principal = definition
            .Principal()
            .map_err(|e| format!("无法创建任务主体：{e}"))?;
        principal
            .SetLogonType(TASK_LOGON_INTERACTIVE_TOKEN)
            .map_err(|e| format!("无法写入登录方式：{e}"))?;
        principal
            .SetRunLevel(TASK_RUNLEVEL_LUA)
            .map_err(|e| format!("无法写入运行级别：{e}"))?;

        let settings = definition
            .Settings()
            .map_err(|e| format!("无法创建任务设置：{e}"))?;
        settings
            .SetStartWhenAvailable(VARIANT_TRUE)
            .map_err(|e| format!("无法写入启动设置：{e}"))?;
        settings
            .SetStopIfGoingOnBatteries(VARIANT_FALSE)
            .map_err(|e| format!("无法写入电源设置：{e}"))?;
        settings
            .SetDisallowStartIfOnBatteries(VARIANT_FALSE)
            .map_err(|e| format!("无法写入电源设置：{e}"))?;
        settings
            .SetExecutionTimeLimit(&BSTR::from("PT5M"))
            .map_err(|e| format!("无法写入执行时限：{e}"))?;
        settings
            .SetHidden(VARIANT_TRUE)
            .map_err(|e| format!("无法写入可见性设置：{e}"))?;

        let trigger = definition
            .Triggers()
            .map_err(|e| format!("无法创建触发器集合：{e}"))?
            .Create(TASK_TRIGGER_TIME)
            .map_err(|e| format!("无法创建时间触发器：{e}"))?;
        let time_trigger: ITimeTrigger = trigger
            .cast()
            .map_err(|e| format!("无法读取时间触发器：{e}"))?;
        let start = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        time_trigger
            .SetStartBoundary(&BSTR::from(start))
            .map_err(|e| format!("无法写入开始时间：{e}"))?;
        let repetition = time_trigger
            .Repetition()
            .map_err(|e| format!("无法创建重复规则：{e}"))?;
        repetition
            .SetInterval(&BSTR::from("PT1M"))
            .map_err(|e| format!("无法写入重复间隔：{e}"))?;
        repetition
            .SetDuration(&BSTR::from("P3650D"))
            .map_err(|e| format!("无法写入重复时长：{e}"))?;
        repetition
            .SetStopAtDurationEnd(VARIANT_FALSE)
            .map_err(|e| format!("无法写入重复规则：{e}"))?;

        let action = definition
            .Actions()
            .map_err(|e| format!("无法创建动作集合：{e}"))?
            .Create(TASK_ACTION_EXEC)
            .map_err(|e| format!("无法创建执行动作：{e}"))?;
        let exec_action: IExecAction = action
            .cast()
            .map_err(|e| format!("无法读取执行动作：{e}"))?;
        let exe = std::env::current_exe().map_err(|e| format!("无法定位程序路径：{e}"))?;
        exec_action
            .SetPath(&BSTR::from(exe.display().to_string()))
            .map_err(|e| format!("无法写入程序路径：{e}"))?;
        exec_action
            .SetArguments(&BSTR::from("--reminder-check"))
            .map_err(|e| format!("无法写入启动参数：{e}"))?;

        root.RegisterTaskDefinition(
            &BSTR::from(SCHEDULED_TASK_NAME),
            &definition,
            TASK_CREATE_OR_UPDATE.0,
            &VARIANT::default(),
            &VARIANT::default(),
            TASK_LOGON_INTERACTIVE_TOKEN,
            &VARIANT::default(),
        )
        .map_err(|e| format!("计划任务注册失败：{e}"))?;
        Ok("已注册后台提醒任务".to_string())
    }
}

#[cfg(not(windows))]
pub fn register_scheduled_reminders(_enabled: bool) -> Result<String, String> {
    Err("当前系统不支持计划任务".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn test_db() -> Connection {
        let conn = db::open_in_memory().expect("open in-memory db");
        db::migrate(&conn).expect("migrate");
        db::seed_defaults(&conn).expect("seed defaults");
        conn
    }

    #[test]
    fn reminder_log_deduplicates() {
        let conn = test_db();
        let task = repositories::create_task(
            &conn,
            crate::models::TaskCreateInput {
                title: "提醒测试".into(),
                due_at: Some(crate::models::now_iso()),
                ..Default::default()
            },
        )
        .unwrap();
        conn.execute(
            "INSERT INTO reminder_events (task_id, reminded_at) VALUES (?1, ?2)",
            rusqlite::params![task.id, crate::models::now_iso()],
        )
        .unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM reminder_events WHERE task_id = ?",
                rusqlite::params![task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
