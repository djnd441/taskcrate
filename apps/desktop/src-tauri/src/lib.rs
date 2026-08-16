#![recursion_limit = "512"]
mod ai;
mod attachments;
mod audit;
mod backup;
mod backup_zip;
mod collaboration;
mod commands;
mod db;
mod error;
mod library;
mod models;
mod notify;
mod reminders;
mod repositories;
mod secrets;
mod sharing;
mod state_machine;
mod templates;
mod transfer;

use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

pub struct AppState {
    pub conn: Mutex<Connection>,
    pub data_dir: PathBuf,
}

fn background_tick(
    data_dir: &Path,
    conn: &Connection,
) -> Result<Vec<reminders::PendingReminder>, String> {
    let settings = repositories::get_settings(conn).map_err(|e| e.to_string())?;
    let pending = reminders::collect_due_reminders(data_dir, conn)?;

    if let Some(interval) = settings.backup_interval_hours {
        backup::run_scheduled_backup(conn, data_dir, interval).map_err(|e| e.to_string())?;
    }
    Ok(pending)
}

fn show_main_window_only(handle: &tauri::AppHandle) {
    for (_, window) in handle.webview_windows() {
        if window.label() == "main" {
            let _ = window.show();
        } else {
            let _ = window.hide();
        }
    }
}

fn toggle_capture_window(handle: &tauri::AppHandle) {
    if let Some(window) = handle.get_webview_window("capture") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
fn start_background_services(handle: &tauri::AppHandle) {
    let handle = handle.clone();
    std::thread::spawn(move || loop {
        if let Some(state) = handle.try_state::<AppState>() {
            if let Ok(conn) = state.conn.lock() {
                let pending = background_tick(&state.data_dir, &conn).unwrap_or_default();
                drop(conn);
                reminders::send_reminders(&handle, &pending);
            }
        }
        std::thread::sleep(Duration::from_secs(60));
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let reminder_check = std::env::args().any(|arg| arg == "--reminder-check");
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "capture" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts(["ctrl+shift+space"])?
                        .with_handler(|app, shortcut, event| {
                            if event.state == ShortcutState::Pressed
                                && shortcut
                                    .matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::Space)
                            {
                                toggle_capture_window(app);
                            }
                        })
                        .build(),
                )?;
            }
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("无法解析应用数据目录：{e}"))?;
            std::fs::create_dir_all(&data_dir).map_err(|e| format!("无法创建应用数据目录：{e}"))?;
            let conn = db::open_connection(&data_dir.join("task-manager.db"))?;
            db::migrate(&conn)?;
            db::seed_defaults(&conn)?;
            crate::secrets::migrate_legacy(&data_dir, &conn)?;
            let remind_when_closed = repositories::get_settings(&conn)
                .map(|settings| settings.remind_when_closed)
                .unwrap_or(false);
            let state = AppState {
                conn: Mutex::new(conn),
                data_dir: data_dir.clone(),
            };
            if reminder_check {
                for (_, window) in app.webview_windows() {
                    let _ = window.hide();
                }
                let handle = app.handle().clone();
                if let Ok(conn) = state.conn.lock() {
                    let pending =
                        reminders::collect_due_reminders(&data_dir, &conn).unwrap_or_default();
                    drop(conn);
                    reminders::send_reminders(&handle, &pending);
                }
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(1500));
                    let _ = handle.exit(0);
                });
            } else {
                if remind_when_closed {
                    let _ = reminders::register_scheduled_reminders(true);
                }
                show_main_window_only(app.handle());
                start_background_services(app.handle());
            }
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::play_reminder_sound,
            commands::set_scheduled_reminders,
            commands::get_settings,
            commands::update_settings,
            commands::ai_chat,
            commands::ai_execute_tool,
            commands::ai_test_connection,
            commands::ai_get_config,
            commands::ai_save_api_key,
            commands::list_ai_conversations,
            commands::get_ai_conversation,
            commands::create_ai_conversation,
            commands::save_ai_conversation,
            commands::delete_ai_conversation,
            commands::list_task_attachments,
            commands::count_task_attachments,
            commands::add_task_attachment,
            commands::delete_task_attachment,
            commands::package_task,
            commands::list_library_resources,
            commands::add_library_resource,
            commands::delete_library_resource,
            commands::copy_library_resource_to_task,
            commands::export_share_task,
            commands::import_share_file,
            commands::import_share_json_text,
            commands::list_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
            commands::archive_project,
            commands::delete_project,
            commands::list_tags,
            commands::get_tag,
            commands::create_tag,
            commands::update_tag,
            commands::delete_tag,
            commands::list_audit_logs,
            commands::list_task_comments,
            commands::add_task_comment,
            commands::delete_task_comment,
            commands::list_project_members,
            commands::add_project_member,
            commands::delete_project_member,
            commands::send_test_notification,
            commands::list_task_templates,
            commands::get_task_template,
            commands::create_task_template,
            commands::delete_task_template,
            commands::export_task_template_json,
            commands::import_task_template_json,
            commands::export_task_template_file,
            commands::import_task_template_file,
            commands::create_capture_task,
            commands::list_tasks,
            commands::get_task,
            commands::create_task,
            commands::update_task,
            commands::transition_task_status,
            commands::archive_task,
            commands::unarchive_task,
            commands::soft_delete_task,
            commands::restore_task,
            commands::hard_delete_task,
            commands::list_due_reminders,
            commands::batch_complete_tasks,
            commands::batch_soft_delete_tasks,
            commands::batch_restore_tasks,
            commands::batch_hard_delete_tasks,
            commands::clear_trash,
            commands::batch_set_priority,
            commands::batch_set_project,
            commands::batch_add_tags,
            commands::backup_now,
            commands::restore_backup,
            commands::list_backups,
            commands::export_json,
            commands::export_csv,
            commands::export_excel,
            commands::import_csv,
            commands::import_excel,
            commands::import_json,
            commands::import_json_text,
            commands::check_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Ready = event {
                let reminder_check = std::env::args().any(|arg| arg == "--reminder-check");
                if reminder_check {
                    for (_, window) in app_handle.webview_windows() {
                        let _ = window.hide();
                    }
                } else {
                    show_main_window_only(app_handle);
                }
            }
        });
}
