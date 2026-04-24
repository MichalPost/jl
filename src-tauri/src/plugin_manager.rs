use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, State};

use crate::{
    error::AppError,
    task_store::{AppPaths, AppState, TaskStore},
    types::{PluginEntryCode, PluginInfo, PluginManifest},
};

fn resolve_plugin_root(app: &AppHandle, state: &State<'_, AppState>) -> Result<PathBuf, AppError> {
    let paths = AppPaths::resolve(app)?;
    let settings = state.settings_store.get_settings()?;
    let configured = PathBuf::from(settings.plugin_dir);
    let root = if configured.is_absolute() {
        configured
    } else {
        paths.base_dir.join(configured)
    };

    fs::create_dir_all(&root)?;
    Ok(root)
}

fn read_plugin_state(app: &AppHandle) -> Result<BTreeMap<String, bool>, AppError> {
    let paths = AppPaths::resolve(app)?;
    TaskStore::read_json(&paths.plugin_state_file)
}

fn write_plugin_state(app: &AppHandle, value: &BTreeMap<String, bool>) -> Result<(), AppError> {
    let paths = AppPaths::resolve(app)?;
    TaskStore::write_json(&paths.plugin_state_file, value)
}

fn validate_extension_points(points: &[String]) -> Result<(), AppError> {
    let supported = HashSet::from([
        "popup-action".to_string(),
        "post-save".to_string(),
        "spotlight-source".to_string(),
    ]);

    if points.iter().all(|point| supported.contains(point)) {
        Ok(())
    } else {
        Err(AppError::Plugin("存在不支持的 extensionPoints".to_string()))
    }
}

fn parse_manifest(path: &Path) -> Result<PluginManifest, AppError> {
    let content = fs::read_to_string(path)?;
    let manifest: PluginManifest = serde_json::from_str(&content)?;

    if manifest.id.trim().is_empty()
        || manifest.name.trim().is_empty()
        || manifest.version.trim().is_empty()
    {
        return Err(AppError::Plugin("manifest 缺少必填字段".to_string()));
    }

    validate_extension_points(&manifest.extension_points)?;
    Ok(manifest)
}

fn scan_plugins(
    app: &AppHandle,
    state: &State<'_, AppState>,
) -> Result<Vec<(PluginInfo, PathBuf)>, AppError> {
    let root = resolve_plugin_root(app, state)?;
    let enabled_state = read_plugin_state(app)?;
    let mut plugins = Vec::new();

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_string();
        let manifest_path = entry.path().join("manifest.json");
        let entry_path = entry.path().join("index.js");

        match parse_manifest(&manifest_path) {
            Ok(manifest) => {
                let enabled = enabled_state.get(&manifest.id).copied().unwrap_or(true);
                let load_error = if entry_path.exists() {
                    None
                } else {
                    Some("缺少 index.js 入口文件".to_string())
                };

                plugins.push((
                    PluginInfo {
                        id: manifest.id.clone(),
                        name: manifest.name,
                        version: manifest.version,
                        extension_points: manifest.extension_points,
                        enabled,
                        load_error,
                    },
                    entry_path,
                ));
            }
            Err(error) => {
                plugins.push((
                    PluginInfo {
                        id: folder_name.clone(),
                        name: folder_name.clone(),
                        version: "0.0.0".to_string(),
                        extension_points: vec![],
                        enabled: false,
                        load_error: Some(error.to_string()),
                    },
                    entry_path,
                ));
            }
        }
    }

    plugins.sort_by(|left, right| left.0.name.cmp(&right.0.name));
    Ok(plugins)
}

#[tauri::command]
pub fn list_plugins(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<PluginInfo>, AppError> {
    Ok(scan_plugins(&app, &state)?
        .into_iter()
        .map(|(info, _)| info)
        .collect())
}

#[tauri::command]
pub fn toggle_plugin(app: AppHandle, id: String, enabled: bool) -> Result<(), AppError> {
    let mut state = read_plugin_state(&app)?;
    state.insert(id, enabled);
    write_plugin_state(&app, &state)
}

#[tauri::command]
pub fn get_plugin_entry_code(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<PluginEntryCode, AppError> {
    let plugins = scan_plugins(&app, &state)?;
    let (_, entry_path) = plugins
        .into_iter()
        .find(|(info, _)| info.id == id)
        .ok_or_else(|| AppError::NotFound(format!("plugin not found: {id}")))?;

    let code = fs::read_to_string(entry_path)
        .map_err(|error| AppError::Plugin(error.to_string()))?;

    Ok(PluginEntryCode { id, code })
}
