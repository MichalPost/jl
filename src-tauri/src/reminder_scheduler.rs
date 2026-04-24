use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
};

use chrono::{DateTime, Utc};
use tauri::{AppHandle, Emitter, State};

use crate::{error::AppError, task_store::AppState};

static REMINDER_TASKS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn tasks() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    REMINDER_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn trigger_reminder(app: &AppHandle, item_id: String) {
    let _ = app.emit("reminder-triggered", serde_json::json!({ "itemId": item_id }));
}

pub fn resync_scheduler(app: &AppHandle, state: &State<'_, AppState>) -> Result<(), AppError> {
    let items = state.task_store.list_items()?;
    let mut guard = tasks()
        .lock()
        .expect("reminder scheduler task lock poisoned");

    for token in guard.values() {
        token.store(true, Ordering::Relaxed);
    }
    guard.clear();

    for item in items.into_iter().filter(|item| !item.completed) {
        let Some(remind_at) = item.remind_at.clone() else {
            continue;
        };

        let Ok(remind_time) = DateTime::parse_from_rfc3339(&remind_at) else {
            continue;
        };

        let remind_time = remind_time.with_timezone(&Utc);
        let token = Arc::new(AtomicBool::new(false));
        guard.insert(item.id.clone(), token.clone());

        if remind_time <= Utc::now() {
            trigger_reminder(app, item.id.clone());
            continue;
        }

        let app_handle = app.clone();
        let item_id = item.id.clone();
        thread::spawn(move || {
            let now = Utc::now();
            let Ok(wait_duration) = (remind_time - now).to_std() else {
                trigger_reminder(&app_handle, item_id.clone());
                return;
            };

            thread::sleep(wait_duration);
            if !token.load(Ordering::Relaxed) {
                trigger_reminder(&app_handle, item_id);
            }
        });
    }

    Ok(())
}

pub fn initialize_scheduler(
    app: &AppHandle,
    state: &State<'_, AppState>,
) -> Result<(), AppError> {
    resync_scheduler(app, state)
}
