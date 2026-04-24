use std::{
    env,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::Instant,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    error::AppError,
    selection_monitor,
    task_store::AppState,
    types::{
        OcrProviderInfo, OcrResult, OcrSelectionMetadata, ScreenshotDisplay, ScreenshotSession,
        StartScreenshotOcrPayload, TextSelectedPayload,
    },
    window_manager,
};

const WINDOWS_OCR: &str = "windows_ocr";
const TESSERACT_CLI: &str = "tesseract_cli";
const TESSERACT_JS: &str = "tesseract_js";
const OCR_BROWSER_PADDLE: &str = "ocr_browser_paddle";
const OCR_SPACE: &str = "ocr_space";

#[derive(Debug, Clone)]
struct PreparedImage {
    path: PathBuf,
    should_cleanup: bool,
}

#[derive(Debug, Clone, Copy)]
struct ScreenBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone)]
struct ScreenTopology {
    virtual_bounds: ScreenBounds,
    displays: Vec<ScreenshotDisplay>,
}

#[derive(Default)]
pub struct ScreenshotSessionState {
    current: Mutex<Option<ScreenshotSession>>,
}

impl ScreenshotSessionState {
    pub fn set(&self, session: ScreenshotSession) {
        let mut current = self.current.lock().expect("screenshot session lock poisoned");
        *current = Some(session);
    }

    pub fn get(&self) -> Option<ScreenshotSession> {
        let current = self.current.lock().expect("screenshot session lock poisoned");
        current.clone()
    }

    pub fn clear(&self) {
        let mut current = self.current.lock().expect("screenshot session lock poisoned");
        *current = None;
    }
}

impl Drop for PreparedImage {
    fn drop(&mut self) {
        if self.should_cleanup {
            let _ = fs::remove_file(&self.path);
        }
    }
}

trait OcrProvider {
    fn info(&self) -> OcrProviderInfo;
    fn recognize(
        &self,
        image: &PreparedImage,
        payload: &StartScreenshotOcrPayload,
    ) -> Result<OcrResult, AppError>;
}

struct WindowsOcrProvider;
struct TesseractCliProvider {
    tesseract_path: Option<String>,
}

impl OcrProvider for WindowsOcrProvider {
    fn info(&self) -> OcrProviderInfo {
        let available = cfg!(target_os = "windows");
        OcrProviderInfo {
            id: WINDOWS_OCR.to_string(),
            name: "Windows OCR".to_string(),
            runtime: "rust".to_string(),
            available,
            supports_offline: true,
            supports_languages: vec!["auto".to_string(), "zh-CN".to_string(), "en".to_string()],
            priority: 1,
            reason: if available {
                None
            } else {
                Some("仅在 Windows 环境可用".to_string())
            },
        }
    }

    fn recognize(
        &self,
        image: &PreparedImage,
        payload: &StartScreenshotOcrPayload,
    ) -> Result<OcrResult, AppError> {
        if !cfg!(target_os = "windows") {
            return Err(AppError::Ocr("Windows OCR 仅在 Windows 环境可用".to_string()));
        }

        let started = Instant::now();
        let text = recognize_with_windows_ocr(&image.path, payload.language.as_deref().unwrap_or("auto"))?;
        Ok(build_result(
            WINDOWS_OCR,
            "rust",
            started,
            text,
            None,
            Vec::new(),
        ))
    }
}

impl OcrProvider for TesseractCliProvider {
    fn info(&self) -> OcrProviderInfo {
        let executable = self.resolve_executable();
        let available = executable
            .as_ref()
            .is_some_and(|path| command_exists(path, &["--version"]));

        OcrProviderInfo {
            id: TESSERACT_CLI.to_string(),
            name: "Tesseract CLI".to_string(),
            runtime: "rust".to_string(),
            available,
            supports_offline: true,
            supports_languages: vec!["auto".to_string(), "eng".to_string(), "chi_sim".to_string()],
            priority: 2,
            reason: if available {
                None
            } else {
                Some("未检测到 Tesseract，可在设置页配置 tesseract.exe 路径".to_string())
            },
        }
    }

    fn recognize(
        &self,
        image: &PreparedImage,
        payload: &StartScreenshotOcrPayload,
    ) -> Result<OcrResult, AppError> {
        let executable = self
            .resolve_executable()
            .ok_or_else(|| AppError::Ocr("未找到 Tesseract 可执行文件".to_string()))?;
        let started = Instant::now();
        let language = map_tesseract_language(payload.language.as_deref().unwrap_or("auto"));
        let output = Command::new(executable)
            .arg(&image.path)
            .arg("stdout")
            .arg("-l")
            .arg(language)
            .arg("--oem")
            .arg("1")
            .arg("--psm")
            .arg("6")
            .output()
            .map_err(|error| AppError::Ocr(format!("启动 Tesseract 失败: {error}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(AppError::Ocr(if stderr.is_empty() {
                "Tesseract 执行失败".to_string()
            } else {
                stderr
            }));
        }

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(build_result(
            TESSERACT_CLI,
            "rust",
            started,
            text,
            None,
            Vec::new(),
        ))
    }
}

impl TesseractCliProvider {
    fn resolve_executable(&self) -> Option<String> {
        self.tesseract_path
            .clone()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| Some("tesseract".to_string()))
    }
}

fn build_provider_registry(state: &AppState) -> Vec<Box<dyn OcrProvider>> {
    let settings = state.settings_store.get_settings().unwrap_or_default();
    vec![
        Box::new(WindowsOcrProvider),
        Box::new(TesseractCliProvider {
            tesseract_path: settings.ocr_tesseract_path,
        }),
    ]
}

fn list_all_provider_info(state: &AppState) -> Vec<OcrProviderInfo> {
    let settings = state.settings_store.get_settings().unwrap_or_default();
    let mut providers: Vec<OcrProviderInfo> = build_provider_registry(state)
        .into_iter()
        .map(|provider| provider.info())
        .collect();

    providers.push(OcrProviderInfo {
        id: TESSERACT_JS.to_string(),
        name: "Tesseract.js".to_string(),
        runtime: "frontend".to_string(),
        available: settings.ocr_enable_frontend_providers,
        supports_offline: true,
        supports_languages: vec!["auto".to_string(), "eng".to_string(), "chi_sim".to_string()],
        priority: 3,
        reason: if settings.ocr_enable_frontend_providers {
            None
        } else {
            Some("前端 OCR Provider 已在设置中关闭".to_string())
        },
    });
    providers.push(OcrProviderInfo {
        id: OCR_BROWSER_PADDLE.to_string(),
        name: "OCR Browser Paddle".to_string(),
        runtime: "frontend".to_string(),
        available: settings.ocr_enable_frontend_providers,
        supports_offline: true,
        supports_languages: vec!["zh-CN".to_string(), "en".to_string()],
        priority: 4,
        reason: if settings.ocr_enable_frontend_providers {
            None
        } else {
            Some("前端 OCR Provider 已在设置中关闭".to_string())
        },
    });
    providers.push(OcrProviderInfo {
        id: OCR_SPACE.to_string(),
        name: "OCR.space".to_string(),
        runtime: "cloud".to_string(),
        available: settings
            .ocr_cloud_api_key
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty()),
        supports_offline: false,
        supports_languages: vec!["auto".to_string(), "eng".to_string(), "chs".to_string()],
        priority: 5,
        reason: if settings
            .ocr_cloud_api_key
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            None
        } else {
            Some("未配置 OCR.space API Key".to_string())
        },
    });

    providers
}

fn build_result(
    provider: &str,
    runtime: &str,
    started: Instant,
    text: String,
    error_message: Option<String>,
    fallback_chain: Vec<String>,
) -> OcrResult {
    let trimmed = text.trim().to_string();
    OcrResult {
        provider: provider.to_string(),
        runtime: runtime.to_string(),
        status: if error_message.is_some() {
            "error".to_string()
        } else if trimmed.is_empty() {
            "empty".to_string()
        } else {
            "success".to_string()
        },
        text: trimmed,
        duration_ms: started.elapsed().as_millis() as u64,
        error_message,
        fallback_chain,
    }
}

fn command_exists(command: &str, args: &[&str]) -> bool {
    Command::new(command)
        .args(args)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn map_tesseract_language(language: &str) -> &str {
    match language {
        "auto" => "eng+chi_sim",
        "zh-CN" => "chi_sim",
        "en" => "eng",
        "" => "eng+chi_sim",
        other => other,
    }
}

fn decode_image_data_url(data_url: &str) -> Result<Vec<u8>, AppError> {
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| AppError::InvalidInput("无效的图片 data URL".to_string()))?;
    STANDARD
        .decode(encoded.as_bytes())
        .map_err(|error| AppError::InvalidInput(format!("图片解码失败: {error}")))
}

fn encode_image_to_data_url(image_path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(image_path)?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

fn capture_fullscreen_to_temp_file() -> Result<PreparedImage, AppError> {
    let temp_path = env::temp_dir().join(format!(
        "textclip-screen-{}.png",
        chrono::Utc::now().timestamp_millis()
    ));

    capture_fullscreen_to_path(&temp_path)?;

    Ok(PreparedImage {
        path: temp_path,
        should_cleanup: true,
    })
}

#[cfg(target_os = "windows")]
fn capture_fullscreen_to_path(path: &Path) -> Result<(), AppError> {
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
$bitmap.Save('{path}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
"#,
        path = path.display().to_string().replace('\'', "''"),
    );

    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|error| AppError::Ocr(format!("启动截图脚本失败: {error}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Ocr(if stderr.is_empty() {
            "屏幕截图失败".to_string()
        } else {
            stderr
        }));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn capture_fullscreen_to_path(_path: &Path) -> Result<(), AppError> {
    Err(AppError::Ocr("当前平台暂未实现系统截图".to_string()))
}

#[cfg(target_os = "windows")]
fn get_virtual_screen_topology() -> Result<ScreenTopology, AppError> {
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$payload = @{
  virtual = @{
    x = $bounds.Left
    y = $bounds.Top
    width = $bounds.Width
    height = $bounds.Height
  }
  displays = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
    @{
      id = $_.DeviceName
      x = $_.Bounds.Left
      y = $_.Bounds.Top
      width = $_.Bounds.Width
      height = $_.Bounds.Height
      isPrimary = $_.Primary
    }
  }
} | ConvertTo-Json -Depth 4
Write-Output $payload
"#;

    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|error| AppError::Ocr(format!("读取虚拟屏幕范围失败: {error}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Ocr(if stderr.is_empty() {
            "读取虚拟屏幕范围失败".to_string()
        } else {
            stderr
        }));
    }

    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|_| AppError::Ocr("虚拟屏幕范围解析失败".to_string()))?;
    let virtual_bounds = ScreenBounds {
        x: parsed
            .get("virtual")
            .and_then(|value| value.get("x"))
            .and_then(|value| value.as_i64())
            .ok_or_else(|| AppError::Ocr("虚拟屏幕 X 坐标解析失败".to_string()))? as i32,
        y: parsed
            .get("virtual")
            .and_then(|value| value.get("y"))
            .and_then(|value| value.as_i64())
            .ok_or_else(|| AppError::Ocr("虚拟屏幕 Y 坐标解析失败".to_string()))? as i32,
        width: parsed
            .get("virtual")
            .and_then(|value| value.get("width"))
            .and_then(|value| value.as_u64())
            .ok_or_else(|| AppError::Ocr("虚拟屏幕宽度解析失败".to_string()))? as u32,
        height: parsed
            .get("virtual")
            .and_then(|value| value.get("height"))
            .and_then(|value| value.as_u64())
            .ok_or_else(|| AppError::Ocr("虚拟屏幕高度解析失败".to_string()))? as u32,
    };
    let displays = parsed
        .get("displays")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| serde_json::from_value::<ScreenshotDisplay>(value).ok())
        .collect();

    Ok(ScreenTopology {
        virtual_bounds,
        displays,
    })
}

#[cfg(not(target_os = "windows"))]
fn get_virtual_screen_topology() -> Result<ScreenTopology, AppError> {
    Ok(ScreenTopology {
        virtual_bounds: ScreenBounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        },
        displays: vec![ScreenshotDisplay {
            id: "display-1".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_primary: true,
        }],
    })
}

fn prepare_image(payload: &StartScreenshotOcrPayload) -> Result<PreparedImage, AppError> {
    if let Some(image_path) = payload.image_path.as_ref() {
        let path = PathBuf::from(image_path);
        if !path.exists() {
            return Err(AppError::NotFound(format!("图片不存在: {}", path.display())));
        }
        return Ok(PreparedImage {
            path,
            should_cleanup: false,
        });
    }

    if let Some(image_data_url) = payload.image_data_url.as_ref() {
        let bytes = decode_image_data_url(image_data_url)?;
        let temp_path = env::temp_dir().join(format!(
            "textclip-ocr-{}.png",
            chrono::Utc::now().timestamp_millis()
        ));
        fs::write(&temp_path, bytes)?;
        return Ok(PreparedImage {
            path: temp_path,
            should_cleanup: true,
        });
    }

    Err(AppError::InvalidInput(
        "OCR 需要 imagePath 或 imageDataUrl".to_string(),
    ))
}

fn execution_order(payload: &StartScreenshotOcrPayload, state: &AppState) -> Vec<String> {
    let settings = state.settings_store.get_settings().unwrap_or_default();
    let mut order = Vec::new();

    if let Some(provider_id) = payload.provider_id.as_ref() {
        order.push(provider_id.clone());
    } else {
        order.push(settings.ocr_provider);
    }

    if payload.disable_fallback.unwrap_or(false) {
        return order;
    }

    for provider in settings.ocr_fallback_order {
        if !order.contains(&provider) {
            order.push(provider);
        }
    }

    order
}

fn emit_selection_from_ocr(
    app: &AppHandle,
    state: &State<'_, AppState>,
    result: &OcrResult,
    payload: &StartScreenshotOcrPayload,
) -> Result<(), AppError> {
    let selection = TextSelectedPayload {
        text: result.text.clone(),
        x: payload.x.unwrap_or(180.0),
        y: payload.y.unwrap_or(160.0),
        source: selection_monitor::capture_source(),
        context: Default::default(),
        ocr: Some(OcrSelectionMetadata {
            provider: result.provider.clone(),
            runtime: result.runtime.clone(),
            status: result.status.clone(),
            duration_ms: result.duration_ms,
        }),
    };

    state.selection_state.remember(selection.clone());
    app.emit("text-selected", &selection)
        .map_err(|error| AppError::Window(error.to_string()))?;
    window_manager::show_overlay_window_inner(app)?;
    Ok(())
}

fn run_windows_ocr_script(image_path: &Path, language: &str) -> Result<String, AppError> {
    let script = format!(
        r#"
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$path = '{path}'
$languageTag = '{language}'
$file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($path).AsTask().GetAwaiter().GetResult()
$stream = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read).AsTask().GetAwaiter().GetResult()
$decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream).AsTask().GetAwaiter().GetResult()
$bitmap = $decoder.GetSoftwareBitmapAsync().AsTask().GetAwaiter().GetResult()
if ($languageTag -eq 'auto' -or [string]::IsNullOrWhiteSpace($languageTag)) {{
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}} else {{
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $languageTag))
}}
if ($null -eq $engine) {{
  throw 'Windows OCR 初始化失败'
}}
$result = $engine.RecognizeAsync($bitmap).AsTask().GetAwaiter().GetResult()
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $result.Text
"#,
        path = image_path.display().to_string().replace('\'', "''"),
        language = language.replace('\'', "''"),
    );

    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|error| AppError::Ocr(format!("启动 Windows OCR 失败: {error}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Ocr(if stderr.is_empty() {
            "Windows OCR 执行失败".to_string()
        } else {
            stderr
        }));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn recognize_with_windows_ocr(image_path: &Path, language: &str) -> Result<String, AppError> {
    run_windows_ocr_script(image_path, language)
}

#[cfg(not(target_os = "windows"))]
fn recognize_with_windows_ocr(_image_path: &Path, _language: &str) -> Result<String, AppError> {
    Err(AppError::Ocr("Windows OCR 仅在 Windows 环境可用".to_string()))
}

#[tauri::command]
pub fn list_ocr_providers(state: State<'_, AppState>) -> Result<Vec<OcrProviderInfo>, AppError> {
    Ok(list_all_provider_info(&state))
}

#[tauri::command]
pub fn start_screenshot_selection(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ScreenshotSession, AppError> {
    start_screenshot_selection_inner(&app, &state)
}

pub fn start_screenshot_selection_inner(
    app: &AppHandle,
    state: &AppState,
) -> Result<ScreenshotSession, AppError> {
    let image = capture_fullscreen_to_temp_file()?;
    let image_data_url = encode_image_to_data_url(&image.path)?;
    let topology = get_virtual_screen_topology()?;
    let bounds = topology.virtual_bounds;
    let session = ScreenshotSession {
        image_data_url,
        origin_x: bounds.x,
        origin_y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        displays: topology.displays,
    };

    state.screenshot_session_state.set(session.clone());
    window_manager::configure_screenshot_window_bounds(
        app,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
    )?;
    window_manager::show_screenshot_window_inner(app)?;
    let _ = app.emit("screenshot-selection-started", &session);

    Ok(session)
}

#[tauri::command]
pub fn get_pending_screenshot_session(
    state: State<'_, AppState>,
) -> Result<Option<ScreenshotSession>, AppError> {
    Ok(state.screenshot_session_state.get())
}

#[tauri::command]
pub fn cancel_screenshot_selection(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.screenshot_session_state.clear();
    window_manager::hide_screenshot_window_inner(&app)?;
    Ok(())
}

#[tauri::command]
pub fn start_screenshot_ocr(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: Option<StartScreenshotOcrPayload>,
) -> Result<OcrResult, AppError> {
    let payload = payload.unwrap_or_default();
    let image = prepare_image(&payload)?;
    let registry = build_provider_registry(&state);
    let mut fallback_chain = Vec::new();
    let order = execution_order(&payload, &state);

    for provider_id in order {
        let Some(provider) = registry.iter().find(|provider| provider.info().id == provider_id) else {
            continue;
        };

        let info = provider.info();
        if !info.available {
            fallback_chain.push(info.id.clone());
            continue;
        }

        match provider.recognize(&image, &payload) {
            Ok(mut result) => {
                result.fallback_chain = fallback_chain.clone();
                if result.status == "success" && payload.emit_selection.unwrap_or(true) {
                    emit_selection_from_ocr(&app, &state, &result, &payload)?;
                }
                return Ok(result);
            }
            Err(error) => {
                fallback_chain.push(info.id.clone());
                if payload.disable_fallback.unwrap_or(false) {
                    return Ok(build_result(
                        &info.id,
                        &info.runtime,
                        Instant::now(),
                        String::new(),
                        Some(error.to_string()),
                        fallback_chain,
                    ));
                }
            }
        }
    }

    Ok(OcrResult {
        provider: payload
            .provider_id
            .unwrap_or_else(|| "unavailable".to_string()),
        runtime: "rust".to_string(),
        status: "error".to_string(),
        text: String::new(),
        duration_ms: 0,
        error_message: Some("没有可用的 Rust OCR Provider，可切换到前端或云端引擎".to_string()),
        fallback_chain,
    })
}

#[cfg(test)]
mod tests {
    use super::{map_tesseract_language, TESSERACT_CLI, WINDOWS_OCR};
    use crate::types::StartScreenshotOcrPayload;

    #[test]
    fn maps_auto_language_to_dual_language_pack() {
        assert_eq!(map_tesseract_language("auto"), "eng+chi_sim");
    }

    #[test]
    fn payload_defaults_allow_fallback() {
        let payload = StartScreenshotOcrPayload::default();
        assert!(payload.provider_id.is_none());
        assert!(payload.disable_fallback.is_none());
    }

    #[test]
    fn provider_ids_stay_stable() {
        assert_eq!(WINDOWS_OCR, "windows_ocr");
        assert_eq!(TESSERACT_CLI, "tesseract_cli");
    }
}
