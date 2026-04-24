use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ItemType {
    #[default]
    Todo,
    Note,
    Highlight,
    ReadLater,
    Sticky,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Source {
    pub r#type: String,
    pub url: Option<String>,
    pub title: Option<String>,
    pub app_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Context {
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TextSelectedPayload {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub source: Source,
    pub context: Context,
    pub ocr: Option<OcrSelectionMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OcrSelectionMetadata {
    pub provider: String,
    pub runtime: String,
    pub status: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OcrProviderInfo {
    pub id: String,
    pub name: String,
    pub runtime: String,
    pub available: bool,
    pub supports_offline: bool,
    pub supports_languages: Vec<String>,
    pub priority: u8,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartScreenshotOcrPayload {
    pub provider_id: Option<String>,
    pub language: Option<String>,
    pub disable_fallback: Option<bool>,
    pub emit_selection: Option<bool>,
    pub image_data_url: Option<String>,
    pub image_path: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub provider: String,
    pub runtime: String,
    pub status: String,
    pub text: String,
    pub duration_ms: u64,
    pub error_message: Option<String>,
    pub fallback_chain: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotDisplay {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotSession {
    pub image_data_url: String,
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: u32,
    pub height: u32,
    pub displays: Vec<ScreenshotDisplay>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntentResult {
    pub intent: String,
    pub confidence: f64,
    pub suggestion: Option<String>,
    pub translation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id: String,
    pub r#type: ItemType,
    pub text: String,
    pub source: Source,
    pub context: Context,
    pub created_at: String,
    pub updated_at: String,
    pub completed: bool,
    pub inbox: bool,
    pub project_id: Option<String>,
    pub tags: Vec<String>,
    pub remind_at: Option<String>,
    pub ai_intent: Option<IntentResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveItemPayload {
    pub r#type: ItemType,
    pub text: String,
    pub source: Source,
    pub context: Context,
    pub tags: Option<Vec<String>>,
    pub remind_at: Option<String>,
    pub ai_intent: Option<IntentResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateItemPayload {
    pub id: String,
    pub text: Option<String>,
    pub completed: Option<bool>,
    pub inbox: Option<bool>,
    pub project_id: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub remind_at: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub ai_api_key: Option<String>,
    pub ai_api_endpoint: String,
    pub ai_model: String,
    pub screenshot_hotkey: String,
    pub spotlight_hotkey: String,
    pub quick_save_hotkey: String,
    pub plugin_dir: String,
    pub theme: String,
    pub custom_primary_color: Option<String>,
    pub follow_system_theme: bool,
    pub ocr_provider: String,
    pub ocr_fallback_order: Vec<String>,
    pub ocr_language: String,
    pub ocr_tesseract_path: Option<String>,
    pub ocr_cloud_provider: Option<String>,
    pub ocr_cloud_api_key: Option<String>,
    pub ocr_enable_frontend_providers: bool,
    pub ocr_preferred_offline_provider: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ai_api_key: None,
            ai_api_endpoint: "https://api.openai.com/v1/chat/completions".to_string(),
            ai_model: "gpt-4.1-mini".to_string(),
            screenshot_hotkey: "Ctrl+Shift+S".to_string(),
            spotlight_hotkey: "Alt+Space".to_string(),
            quick_save_hotkey: "Ctrl+D".to_string(),
            plugin_dir: "plugins".to_string(),
            theme: "snow".to_string(),
            custom_primary_color: None,
            follow_system_theme: false,
            ocr_provider: "windows_ocr".to_string(),
            ocr_fallback_order: vec![
                "windows_ocr".to_string(),
                "tesseract_cli".to_string(),
                "tesseract_js".to_string(),
                "ocr_browser_paddle".to_string(),
                "ocr_space".to_string(),
            ],
            ocr_language: "auto".to_string(),
            ocr_tesseract_path: None,
            ocr_cloud_provider: Some("ocr_space".to_string()),
            ocr_cloud_api_key: None,
            ocr_enable_frontend_providers: true,
            ocr_preferred_offline_provider: Some("windows_ocr".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CreateProjectPayload {
    pub name: String,
    pub color: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateProjectPayload {
    pub id: String,
    pub name: Option<String>,
    pub color: Option<String>,
    pub description: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickyState {
    pub id: String,
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub extension_points: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub extension_points: Vec<String>,
    pub enabled: bool,
    pub load_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginEntryCode {
    pub id: String,
    pub code: String,
}
