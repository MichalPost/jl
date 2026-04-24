use std::{
    path::PathBuf,
    sync::Mutex,
};

use tauri::AppHandle;
use uuid::Uuid;

use crate::{
    error::AppError,
    task_store::{AppPaths, TaskStore},
    types::StickyState,
};

pub struct StickyStore {
    stickies_file: PathBuf,
    lock: Mutex<()>,
}

impl StickyStore {
    pub fn new(stickies_file: PathBuf) -> Self {
        Self {
            stickies_file,
            lock: Mutex::new(()),
        }
    }

    pub fn list(&self) -> Result<Vec<StickyState>, AppError> {
        let _guard = self.lock.lock().expect("sticky store lock poisoned");
        TaskStore::read_json(&self.stickies_file)
    }

    pub fn create(&self, text: String) -> Result<StickyState, AppError> {
        let _guard = self.lock.lock().expect("sticky store lock poisoned");
        let mut stickies: Vec<StickyState> = TaskStore::read_json(&self.stickies_file)?;

        let sticky = StickyState {
            id: Uuid::new_v4().to_string(),
            text,
            x: 100.0,
            y: 100.0,
            visible: true,
        };

        stickies.push(sticky.clone());
        TaskStore::write_json(&self.stickies_file, &stickies)?;
        Ok(sticky)
    }

    pub fn update_position(&self, id: &str, x: f64, y: f64) -> Result<(), AppError> {
        let _guard = self.lock.lock().expect("sticky store lock poisoned");
        let mut stickies: Vec<StickyState> = TaskStore::read_json(&self.stickies_file)?;

        for sticky in &mut stickies {
            if sticky.id == id {
                sticky.x = x;
                sticky.y = y;
            }
        }

        TaskStore::write_json(&self.stickies_file, &stickies)?;
        Ok(())
    }

    pub fn close(&self, id: &str) -> Result<(), AppError> {
        let _guard = self.lock.lock().expect("sticky store lock poisoned");
        let mut stickies: Vec<StickyState> = TaskStore::read_json(&self.stickies_file)?;

        for sticky in &mut stickies {
            if sticky.id == id {
                sticky.visible = false;
            }
        }

        TaskStore::write_json(&self.stickies_file, &stickies)?;
        Ok(())
    }

    pub fn list_visible(&self) -> Result<Vec<StickyState>, AppError> {
        let stickies = self.list()?;
        Ok(stickies.into_iter().filter(|s| s.visible).collect())
    }
}

fn get_sticky_store(app: &AppHandle) -> Result<StickyStore, AppError> {
    let paths = AppPaths::resolve(app)?;
    Ok(StickyStore::new(paths.stickies_file))
}

pub fn mark_sticky_visible(app: &AppHandle, id: &str, visible: bool) -> Result<(), AppError> {
    let store = get_sticky_store(app)?;
    if visible {
        return Ok(());
    }
    store.close(id)
}

pub fn restore_visible_stickies(app: &AppHandle) -> Result<(), AppError> {
    let store = get_sticky_store(app)?;
    for sticky in store.list_visible()? {
        crate::window_manager::show_sticky_window(app, &sticky)?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_sticky(app: AppHandle, text: String) -> Result<serde_json::Value, AppError> {
    let store = get_sticky_store(&app)?;
    let sticky = store.create(text)?;
    crate::window_manager::show_sticky_window(&app, &sticky)?;
    Ok(serde_json::json!({
        "windowId": sticky.id,
        "sticky": sticky,
    }))
}

#[tauri::command]
pub fn close_sticky(app: AppHandle, window_id: String) -> Result<(), AppError> {
    let store = get_sticky_store(&app)?;
    store.close(&window_id)?;
    crate::window_manager::close_sticky_window(&app, &window_id)?;
    Ok(())
}

#[tauri::command]
pub fn list_stickies(app: AppHandle) -> Result<Vec<StickyState>, AppError> {
    let store = get_sticky_store(&app)?;
    store.list_visible()
}

#[tauri::command]
pub fn update_sticky_position(
    app: AppHandle,
    id: String,
    x: f64,
    y: f64,
) -> Result<(), AppError> {
    let store = get_sticky_store(&app)?;
    store.update_position(&id, x, y)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    fn temp_file() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("textclip-stickies-{nonce}.json"))
    }

    #[test]
    fn sticky_round_trip_updates_position_and_visibility() {
        let file = temp_file();
        let store = StickyStore::new(file.clone());

        let created = store.create("hello sticky".to_string()).unwrap();
        store.update_position(&created.id, 320.0, 240.0).unwrap();
        store.close(&created.id).unwrap();

        let all = store.list().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].x, 320.0);
        assert_eq!(all[0].y, 240.0);
        assert!(!all[0].visible);

        let _ = fs::remove_file(file);
    }
}
