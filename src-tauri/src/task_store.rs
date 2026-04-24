use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use chrono::Utc;
use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::{
    error::AppError,
    types::{
        AppSettings, CreateProjectPayload, Item, Project, SaveItemPayload,
        UpdateItemPayload, UpdateProjectPayload,
    },
};

const DEMO_PLUGIN_MANIFEST: &str = r#"{
  "id": "demo-popup-helper",
  "name": "Demo Popup Helper",
  "version": "0.1.0",
  "extensionPoints": ["popup-action", "post-save", "spotlight-source"]
}"#;

const DEMO_PLUGIN_ENTRY: &str = r#"export function getPopupActions(selection) {
  if (!selection?.text?.trim()) return []
  return [
    {
      id: "demo-copy",
      label: "复制到剪贴板",
      description: "把当前划词内容复制出来",
      kind: "copy-text"
    },
    {
      id: "demo-open",
      label: "打开主窗口",
      description: "直接打开任务面板",
      kind: "show-task-manager"
    }
  ]
}

export async function onPostSave(item, api) {
  api.toast("插件已收到保存事件", `${item.text.slice(0, 18)}...`)
}

export async function searchSpotlight(query) {
  if (!query.trim()) return []
  return [
    {
      id: "plugin-result-" + query,
      title: "插件结果：" + query,
      subtitle: "来自 Demo Popup Helper",
      source: "plugin",
      pluginId: "demo-popup-helper"
    }
  ]
}

export async function onSelectSpotlightResult(result, api) {
  api.toast("插件结果已选中", result.title)
}"#;

pub struct AppPaths {
    pub base_dir: PathBuf,
    pub items_file: PathBuf,
    pub projects_file: PathBuf,
    pub stickies_file: PathBuf,
    pub settings_file: PathBuf,
    pub plugin_state_file: PathBuf,
}

impl AppPaths {
    pub fn resolve(app: &AppHandle) -> Result<Self, AppError> {
        let base_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Io(error.to_string()))?;

        Ok(Self {
            items_file: base_dir.join("items.json"),
            projects_file: base_dir.join("projects.json"),
            stickies_file: base_dir.join("stickies.json"),
            settings_file: base_dir.join("settings.json"),
            plugin_state_file: base_dir.join("plugin-state.json"),
            base_dir,
        })
    }
}

pub struct TaskStore {
    items_file: PathBuf,
    projects_file: PathBuf,
    lock: Mutex<()>,
}

impl TaskStore {
    pub fn new(items_file: PathBuf, projects_file: PathBuf) -> Self {
        Self {
            items_file,
            projects_file,
            lock: Mutex::new(()),
        }
    }

    pub fn ensure_storage(paths: &AppPaths) -> Result<(), AppError> {
        fs::create_dir_all(&paths.base_dir)?;

        if !paths.items_file.exists() {
            fs::write(&paths.items_file, "[]")?;
        }
        if !paths.projects_file.exists() {
            fs::write(&paths.projects_file, "[]")?;
        }
        if !paths.stickies_file.exists() {
            fs::write(&paths.stickies_file, "[]")?;
        }
        if !paths.settings_file.exists() {
            fs::write(&paths.settings_file, serde_json::to_string_pretty(&AppSettings::default())?)?;
        }
        if !paths.plugin_state_file.exists() {
            fs::write(&paths.plugin_state_file, "{}")?;
        }
        let plugin_root = paths.base_dir.join(AppSettings::default().plugin_dir);
        fs::create_dir_all(&plugin_root)?;
        Self::ensure_demo_plugin(&plugin_root)?;

        Ok(())
    }

    fn ensure_demo_plugin(plugin_root: &Path) -> Result<(), AppError> {
        let demo_dir = plugin_root.join("demo-popup-helper");
        fs::create_dir_all(&demo_dir)?;

        let manifest_path = demo_dir.join("manifest.json");
        if !manifest_path.exists() {
            fs::write(&manifest_path, DEMO_PLUGIN_MANIFEST)?;
        }

        let entry_path = demo_dir.join("index.js");
        if !entry_path.exists() {
            fs::write(&entry_path, DEMO_PLUGIN_ENTRY)?;
        }

        Ok(())
    }

    pub fn read_json<T: DeserializeOwned + Default>(path: &Path) -> Result<T, AppError> {
        // 文件不存在时安全回退到默认值
        if !path.exists() {
            return Ok(T::default());
        }

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return Ok(T::default()),
        };

        if content.trim().is_empty() {
            return Ok(T::default());
        }

        // JSON 损坏时安全回退到默认值，不崩溃
        Ok(serde_json::from_str(&content).unwrap_or_default())
    }

    pub fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(value)?;
        fs::write(path, content)?;
        Ok(())
    }

    pub fn list_items(&self) -> Result<Vec<Item>, AppError> {
        let _guard = self.lock.lock().expect("task store lock poisoned");
        let mut items: Vec<Item> = Self::read_json(&self.items_file)?;
        items.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(items)
    }

    pub fn save_item(&self, payload: SaveItemPayload) -> Result<Item, AppError> {
        let _guard = self.lock.lock().expect("task store lock poisoned");
        let mut items: Vec<Item> = Self::read_json(&self.items_file)?;
        let timestamp = Utc::now().to_rfc3339();

        let item = Item {
            id: Uuid::new_v4().to_string(),
            r#type: payload.r#type,
            text: payload.text,
            source: payload.source,
            context: payload.context,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            completed: false,
            inbox: true,
            project_id: None,
            tags: payload.tags.unwrap_or_default(),
            remind_at: payload.remind_at,
            ai_intent: payload.ai_intent,
        };

        items.push(item.clone());
        Self::write_json(&self.items_file, &items)?;
        Ok(item)
    }

    pub fn update_item(&self, payload: UpdateItemPayload) -> Result<(), AppError> {
        let _guard = self.lock.lock().expect("task store lock poisoned");
        let mut items: Vec<Item> = Self::read_json(&self.items_file)?;
        let timestamp = Utc::now().to_rfc3339();

        for item in &mut items {
            if item.id == payload.id {
                if let Some(text) = &payload.text {
                    item.text = text.clone();
                }
                if let Some(completed) = payload.completed {
                    item.completed = completed;
                }
                if let Some(inbox) = payload.inbox {
                    item.inbox = inbox;
                }
                if let Some(project_id) = &payload.project_id {
                    item.project_id = project_id.clone();
                }
                if let Some(tags) = &payload.tags {
                    item.tags = tags.clone();
                }
                if let Some(remind_at) = &payload.remind_at {
                    item.remind_at = remind_at.clone();
                }
                item.updated_at = timestamp.clone();
            }
        }

        Self::write_json(&self.items_file, &items)?;
        Ok(())
    }

    pub fn delete_item(&self, id: &str) -> Result<(), AppError> {
        let _guard = self.lock.lock().expect("task store lock poisoned");
        let mut items: Vec<Item> = Self::read_json(&self.items_file)?;
        items.retain(|item| item.id != id);
        Self::write_json(&self.items_file, &items)?;
        Ok(())
    }

    pub fn search_items(&self, query: &str) -> Result<Vec<Item>, AppError> {
        let value = query.trim().to_lowercase();
        let mut items = self.list_items()?;
        items.retain(|item| {
            let haystacks = vec![
                item.text.clone(),
                item.source.url.clone().unwrap_or_default(),
                item.source.title.clone().unwrap_or_default(),
                item.source.app_name.clone().unwrap_or_default(),
                item.context.before.clone(),
                item.context.after.clone(),
                item.tags.join(" "),
            ];

            haystacks.iter().any(|field| field.to_lowercase().contains(&value))
        });
        Ok(items)
    }

    pub fn list_projects(&self) -> Result<Vec<Project>, AppError> {
        let _guard = self.lock.lock().expect("task store lock poisoned");
        let mut projects: Vec<Project> = Self::read_json(&self.projects_file)?;
        projects.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        Ok(projects)
    }

    pub fn create_project(&self, payload: CreateProjectPayload) -> Result<Project, AppError> {
        let _guard = self.lock.lock().expect("task store lock poisoned");
        let mut projects: Vec<Project> = Self::read_json(&self.projects_file)?;
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: payload.name,
            color: payload.color,
            description: payload.description,
            created_at: Utc::now().to_rfc3339(),
        };

        projects.push(project.clone());
        Self::write_json(&self.projects_file, &projects)?;
        Ok(project)
    }

    pub fn update_project(&self, payload: UpdateProjectPayload) -> Result<Project, AppError> {
        let _guard = self.lock.lock().expect("task store lock poisoned");
        let mut projects: Vec<Project> = Self::read_json(&self.projects_file)?;
        let mut updated = None;

        for project in &mut projects {
            if project.id == payload.id {
                if let Some(name) = &payload.name {
                    project.name = name.clone();
                }
                if let Some(color) = &payload.color {
                    project.color = color.clone();
                }
                if let Some(description) = &payload.description {
                    project.description = description.clone();
                }
                updated = Some(project.clone());
                break;
            }
        }

        let Some(updated) = updated else {
            return Err(AppError::Io(format!("project not found: {}", payload.id)));
        };

        Self::write_json(&self.projects_file, &projects)?;
        Ok(updated)
    }

    pub fn delete_project(&self, id: &str) -> Result<(), AppError> {
        let _guard = self.lock.lock().expect("task store lock poisoned");
        let mut projects: Vec<Project> = Self::read_json(&self.projects_file)?;
        projects.retain(|project| project.id != id);

        let mut items: Vec<Item> = Self::read_json(&self.items_file)?;
        for item in &mut items {
            if item.project_id.as_deref() == Some(id) {
                item.project_id = None;
                item.inbox = true;
                item.updated_at = Utc::now().to_rfc3339();
            }
        }

        Self::write_json(&self.projects_file, &projects)?;
        Self::write_json(&self.items_file, &items)?;
        Ok(())
    }
}

pub struct SettingsStore {
    settings_file: PathBuf,
    lock: Mutex<()>,
}

impl SettingsStore {
    pub fn new(settings_file: PathBuf) -> Self {
        Self {
            settings_file,
            lock: Mutex::new(()),
        }
    }

    pub fn get_settings(&self) -> Result<AppSettings, AppError> {
        let _guard = self.lock.lock().expect("settings store lock poisoned");
        TaskStore::read_json(&self.settings_file)
    }

    pub fn save_settings(&self, payload: serde_json::Value) -> Result<AppSettings, AppError> {
        let _guard = self.lock.lock().expect("settings store lock poisoned");
        let mut current: AppSettings = TaskStore::read_json(&self.settings_file).unwrap_or_default();

        if let Some(value) = payload.get("aiApiKey").and_then(|value| value.as_str()) {
            current.ai_api_key = Some(value.to_string());
        }
        if let Some(value) = payload.get("aiApiEndpoint").and_then(|value| value.as_str()) {
            current.ai_api_endpoint = value.to_string();
        }
        if let Some(value) = payload.get("aiModel").and_then(|value| value.as_str()) {
            current.ai_model = value.to_string();
        }
        if let Some(value) = payload.get("screenshotHotkey").and_then(|value| value.as_str()) {
            current.screenshot_hotkey = value.to_string();
        }
        if let Some(value) = payload.get("spotlightHotkey").and_then(|value| value.as_str()) {
            current.spotlight_hotkey = value.to_string();
        }
        if let Some(value) = payload.get("quickSaveHotkey").and_then(|value| value.as_str()) {
            current.quick_save_hotkey = value.to_string();
        }
        if let Some(value) = payload.get("pluginDir").and_then(|value| value.as_str()) {
            current.plugin_dir = value.to_string();
        }
        if let Some(value) = payload.get("theme").and_then(|value| value.as_str()) {
            current.theme = value.to_string();
        }
        if let Some(value) = payload.get("customPrimaryColor").and_then(|value| value.as_str()) {
            current.custom_primary_color = Some(value.to_string());
        }
        if let Some(value) = payload.get("followSystemTheme").and_then(|value| value.as_bool()) {
            current.follow_system_theme = value;
        }
        if let Some(value) = payload.get("ocrProvider").and_then(|value| value.as_str()) {
            current.ocr_provider = value.to_string();
        }
        if let Some(values) = payload.get("ocrFallbackOrder").and_then(|value| value.as_array()) {
            current.ocr_fallback_order = values
                .iter()
                .filter_map(|value| value.as_str().map(ToOwned::to_owned))
                .collect();
        }
        if let Some(value) = payload.get("ocrLanguage").and_then(|value| value.as_str()) {
            current.ocr_language = value.to_string();
        }
        if let Some(value) = payload.get("ocrTesseractPath").and_then(|value| value.as_str()) {
            current.ocr_tesseract_path = Some(value.to_string());
        }
        if payload.get("ocrTesseractPath").is_some()
            && payload.get("ocrTesseractPath").is_some_and(|value| value.is_null())
        {
            current.ocr_tesseract_path = None;
        }
        if let Some(value) = payload.get("ocrCloudProvider").and_then(|value| value.as_str()) {
            current.ocr_cloud_provider = Some(value.to_string());
        }
        if payload.get("ocrCloudProvider").is_some()
            && payload.get("ocrCloudProvider").is_some_and(|value| value.is_null())
        {
            current.ocr_cloud_provider = None;
        }
        if let Some(value) = payload.get("ocrCloudApiKey").and_then(|value| value.as_str()) {
            current.ocr_cloud_api_key = Some(value.to_string());
        }
        if payload.get("ocrCloudApiKey").is_some()
            && payload.get("ocrCloudApiKey").is_some_and(|value| value.is_null())
        {
            current.ocr_cloud_api_key = None;
        }
        if let Some(value) = payload
            .get("ocrEnableFrontendProviders")
            .and_then(|value| value.as_bool())
        {
            current.ocr_enable_frontend_providers = value;
        }
        if let Some(value) = payload
            .get("ocrPreferredOfflineProvider")
            .and_then(|value| value.as_str())
        {
            current.ocr_preferred_offline_provider = Some(value.to_string());
        }
        if payload.get("ocrPreferredOfflineProvider").is_some()
            && payload
                .get("ocrPreferredOfflineProvider")
                .is_some_and(|value| value.is_null())
        {
            current.ocr_preferred_offline_provider = None;
        }

        TaskStore::write_json(&self.settings_file, &current)?;
        Ok(current)
    }
}

pub struct AppState {
    pub task_store: TaskStore,
    pub settings_store: SettingsStore,
    pub selection_state: crate::selection_monitor::SelectionState,
    pub screenshot_session_state: crate::ocr::ScreenshotSessionState,
}

fn emit_projects_changed(app: &AppHandle, change_type: &str, project_id: &str) {
    let _ = app.emit(
        "projects-changed",
        serde_json::json!({ "type": change_type, "projectId": project_id }),
    );
}

#[tauri::command]
pub fn save_item(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    payload: SaveItemPayload,
) -> Result<Item, AppError> {
    let item = state.task_store.save_item(payload)?;
    let _ = app.emit("items-changed", serde_json::json!({ "type": "saved", "itemId": item.id.clone() }));
    let _ = app.emit("item-saved", &item);
    crate::reminder_scheduler::resync_scheduler(&app, &state)?;
    Ok(item)
}

#[tauri::command]
pub fn update_item(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    payload: UpdateItemPayload,
) -> Result<(), AppError> {
    let item_id = payload.id.clone();
    state.task_store.update_item(payload)?;
    let _ = app.emit("items-changed", serde_json::json!({ "type": "updated", "itemId": item_id }));
    crate::reminder_scheduler::resync_scheduler(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn delete_item(app: AppHandle, state: tauri::State<'_, AppState>, id: String) -> Result<(), AppError> {
    state.task_store.delete_item(&id)?;
    let _ = app.emit("items-changed", serde_json::json!({ "type": "deleted", "itemId": id }));
    crate::reminder_scheduler::resync_scheduler(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn list_items(state: tauri::State<'_, AppState>) -> Result<Vec<Item>, AppError> {
    state.task_store.list_items()
}

#[tauri::command]
pub fn search_items(state: tauri::State<'_, AppState>, query: String) -> Result<Vec<Item>, AppError> {
    state.task_store.search_items(&query)
}

#[tauri::command]
pub fn list_projects(state: tauri::State<'_, AppState>) -> Result<Vec<Project>, AppError> {
    state.task_store.list_projects()
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    payload: CreateProjectPayload,
) -> Result<Project, AppError> {
    let project = state.task_store.create_project(payload)?;
    emit_projects_changed(&app, "created", &project.id);
    Ok(project)
}

#[tauri::command]
pub fn update_project(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    payload: UpdateProjectPayload,
) -> Result<Project, AppError> {
    let project = state.task_store.update_project(payload)?;
    emit_projects_changed(&app, "updated", &project.id);
    Ok(project)
}

#[tauri::command]
pub fn delete_project(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state.task_store.delete_project(&id)?;
    emit_projects_changed(&app, "deleted", &id);
    let _ = app.emit(
        "items-changed",
        serde_json::json!({ "type": "project_deleted", "itemId": id }),
    );
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, AppState>) -> Result<AppSettings, AppError> {
    state.settings_store.get_settings()
}

#[tauri::command]
pub fn save_settings(
    state: tauri::State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<AppSettings, AppError> {
    state.settings_store.save_settings(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        Context, CreateProjectPayload, ItemType, SaveItemPayload, Source,
        UpdateItemPayload, UpdateProjectPayload,
    };
    use proptest::prelude::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_file(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("textclip-{name}-{nonce}.json"))
    }

    fn temp_store(name: &str) -> (TaskStore, PathBuf, PathBuf) {
        let items_file = temp_file(&format!("{name}-items"));
        let projects_file = temp_file(&format!("{name}-projects"));
        (
            TaskStore::new(items_file.clone(), projects_file.clone()),
            items_file,
            projects_file,
        )
    }

    fn sample_payload(text: &str) -> SaveItemPayload {
        SaveItemPayload {
            r#type: ItemType::Todo,
            text: text.to_string(),
            source: Source {
                r#type: "browser".to_string(),
                url: Some("https://example.com".to_string()),
                title: Some("Example".to_string()),
                app_name: None,
            },
            context: Context {
                before: "before".to_string(),
                after: "after".to_string(),
            },
            tags: Some(vec!["alpha".to_string(), "beta".to_string()]),
            remind_at: Some("2026-05-01T10:00:00Z".to_string()),
            ai_intent: None,
        }
    }

    #[test]
    fn saves_and_updates_item_round_trip() {
        let (store, items_file, projects_file) = temp_store("items");

        let item = store.save_item(sample_payload("hello")).unwrap();
        store
            .update_item(UpdateItemPayload {
                id: item.id.clone(),
                completed: Some(true),
                remind_at: Some(Some("2026-05-02T10:00:00Z".to_string())),
                ..UpdateItemPayload::default()
            })
            .unwrap();

        let items = store.list_items().unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].completed);
        assert_eq!(items[0].remind_at.as_deref(), Some("2026-05-02T10:00:00Z"));

        let _ = fs::remove_file(items_file);
        let _ = fs::remove_file(projects_file);
    }

    #[test]
    fn search_items_matches_text_source_context_and_tags() {
        let (store, items_file, projects_file) = temp_store("search");
        let _ = store.save_item(sample_payload("ocr fallback doc")).unwrap();

        assert_eq!(store.search_items("fallback").unwrap().len(), 1);
        assert_eq!(store.search_items("example").unwrap().len(), 1);
        assert_eq!(store.search_items("before").unwrap().len(), 1);
        assert_eq!(store.search_items("alpha").unwrap().len(), 1);

        let _ = fs::remove_file(items_file);
        let _ = fs::remove_file(projects_file);
    }

    #[test]
    fn project_round_trip_and_delete_returns_items_to_inbox() {
        let (store, items_file, projects_file) = temp_store("projects");
        let project = store
            .create_project(CreateProjectPayload {
                name: "Research".to_string(),
                color: "#2563eb".to_string(),
                description: Some("notes".to_string()),
            })
            .unwrap();
        let updated = store
            .update_project(UpdateProjectPayload {
                id: project.id.clone(),
                name: Some("Research Updated".to_string()),
                color: None,
                description: Some(Some("updated".to_string())),
            })
            .unwrap();

        assert_eq!(updated.name, "Research Updated");
        assert_eq!(updated.description.as_deref(), Some("updated"));

        let item = store.save_item(sample_payload("archive me")).unwrap();
        store
            .update_item(UpdateItemPayload {
                id: item.id.clone(),
                inbox: Some(false),
                project_id: Some(Some(project.id.clone())),
                ..UpdateItemPayload::default()
            })
            .unwrap();

        store.delete_project(&project.id).unwrap();
        let items = store.list_items().unwrap();
        assert!(items[0].inbox);
        assert_eq!(items[0].project_id, None);
        assert!(store.list_projects().unwrap().is_empty());

        let _ = fs::remove_file(items_file);
        let _ = fs::remove_file(projects_file);
    }

    proptest! {
        #[test]
        fn property_save_item_preserves_duplicate_entries(text in "[A-Za-z0-9 ]{1,32}") {
            let (store, items_file, projects_file) = temp_store("prop-items");

            let _ = store.save_item(sample_payload(&text)).unwrap();
            let _ = store.save_item(sample_payload(&text)).unwrap();
            let items = store.list_items().unwrap();

            prop_assert_eq!(items.len(), 2);
            prop_assert_eq!(items.iter().filter(|item| item.text == text).count(), 2);

            let _ = fs::remove_file(items_file);
            let _ = fs::remove_file(projects_file);
        }
    }
}
