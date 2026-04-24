use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use chrono::{DateTime, Utc};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    context_extractor::extract_context,
    error::AppError,
    task_store::AppState,
    types::{Context, SaveItemPayload, Source, TextSelectedPayload},
    window_manager,
};

// ── Cached selection state ────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CachedSelection {
    pub payload: TextSelectedPayload,
    pub captured_at: DateTime<Utc>,
}

#[derive(Default)]
pub struct SelectionState {
    cached: Mutex<Option<CachedSelection>>,
}

impl SelectionState {
    pub fn remember(&self, payload: TextSelectedPayload) {
        let mut cached = self.cached.lock().expect("selection state lock poisoned");
        *cached = Some(CachedSelection {
            payload,
            captured_at: Utc::now(),
        });
    }

    pub fn latest_within(&self, max_age: chrono::Duration) -> Option<TextSelectedPayload> {
        let cached = self.cached.lock().expect("selection state lock poisoned");
        let selection = cached.as_ref()?;

        if Utc::now().signed_duration_since(selection.captured_at) > max_age {
            return None;
        }

        Some(selection.payload.clone())
    }
}

// ── Text helpers ──────────────────────────────────────────────────────────────

pub fn normalize_selected_text(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let normalized: String = trimmed.chars().take(500).collect();
    Some(normalized)
}

/// Known browser process names (lowercase, without path).
#[cfg(target_os = "windows")]
const BROWSER_PROCESS_NAMES: &[&str] = &[
    "chrome.exe",
    "firefox.exe",
    "msedge.exe",
    "brave.exe",
    "opera.exe",
    "vivaldi.exe",
    "iexplore.exe",
    "safari.exe",
    "arc.exe",
    "thorium.exe",
    "chromium.exe",
];

/// Capture the source of the current foreground window.
///
/// # Windows
/// Uses Win32 APIs to obtain the window title and process name of the
/// foreground window.  If the process is a known browser the source type is
/// set to `"browser"`, otherwise `"app"`.  Any failure falls back to
/// `"unknown"`.
///
/// # Other platforms
/// Returns an `"unknown"` source without crashing.
pub fn capture_source() -> Source {
    #[cfg(target_os = "windows")]
    {
        capture_source_windows()
    }

    #[cfg(not(target_os = "windows"))]
    {
        Source {
            r#type: "unknown".to_string(),
            url: None,
            title: None,
            app_name: None,
        }
    }
}

#[cfg(target_os = "windows")]
fn capture_source_windows() -> Source {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::path::Path;

    // ── Win32 type aliases ────────────────────────────────────────────────
    type HWND    = *mut std::ffi::c_void;
    type HANDLE  = *mut std::ffi::c_void;
    type DWORD   = u32;
    type BOOL    = i32;

    const PROCESS_QUERY_LIMITED_INFORMATION: DWORD = 0x1000;

    extern "system" {
        fn GetForegroundWindow() -> HWND;
        fn GetWindowTextW(hwnd: HWND, lp_string: *mut u16, n_max_count: i32) -> i32;
        fn GetWindowThreadProcessId(hwnd: HWND, lpdw_process_id: *mut DWORD) -> DWORD;
        fn OpenProcess(dw_desired_access: DWORD, b_inherit_handle: BOOL, dw_process_id: DWORD) -> HANDLE;
        fn CloseHandle(h_object: HANDLE) -> BOOL;
        fn QueryFullProcessImageNameW(
            h_process: HANDLE,
            dw_flags: DWORD,
            lp_exe_name: *mut u16,
            lpdw_size: *mut DWORD,
        ) -> BOOL;
    }

    // ── Get foreground window ─────────────────────────────────────────────
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return Source {
            r#type: "unknown".to_string(),
            url: None,
            title: None,
            app_name: None,
        };
    }

    // ── Get window title ──────────────────────────────────────────────────
    let window_title: Option<String> = unsafe {
        let mut buf = vec![0u16; 512];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if len > 0 {
            buf.truncate(len as usize);
            OsString::from_wide(&buf).into_string().ok()
        } else {
            None
        }
    };

    // ── Get process ID ────────────────────────────────────────────────────
    let mut pid: DWORD = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == 0 {
        return Source {
            r#type: "unknown".to_string(),
            url: None,
            title: window_title,
            app_name: None,
        };
    }

    // ── Open process and query full image path ────────────────────────────
    let process_name: Option<String> = unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            None
        } else {
            let mut buf = vec![0u16; 1024];
            let mut size = buf.len() as DWORD;
            let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
            CloseHandle(handle);
            if ok != 0 && size > 0 {
                buf.truncate(size as usize);
                let full_path = OsString::from_wide(&buf).into_string().ok()?;
                // Extract just the file name (e.g. "chrome.exe")
                Path::new(&full_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string())
            } else {
                None
            }
        }
    };

    // ── Determine source type ─────────────────────────────────────────────
    let source_type = match &process_name {
        Some(name) => {
            let lower = name.to_lowercase();
            if BROWSER_PROCESS_NAMES.iter().any(|b| *b == lower.as_str()) {
                "browser"
            } else {
                "app"
            }
        }
        None => "unknown",
    };

    Source {
        r#type: source_type.to_string(),
        url: None, // URL requires a browser extension; not available via Win32
        title: window_title,
        app_name: process_name,
    }
}

#[cfg(target_os = "windows")]
pub fn capture_context(full_text: Option<&str>, selection: &str) -> Context {
    full_text
        .map(|text| extract_context(text, selection))
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
pub fn build_text_selected_payload(
    raw_text: &str,
    x: f64,
    y: f64,
    source: Option<Source>,
    full_text: Option<&str>,
) -> Option<TextSelectedPayload> {
    let text = normalize_selected_text(raw_text)?;
    let source = source.unwrap_or_else(capture_source);
    let context = capture_context(full_text, &text);

    Some(TextSelectedPayload {
        text,
        x,
        y,
        source,
        context,
        ocr: None,
    })
}

// ── Clipboard reading ─────────────────────────────────────────────────────────

/// Attempt to read text from the system clipboard.
/// Returns `None` on any failure; errors are logged silently.
#[cfg(target_os = "windows")]
fn try_read_clipboard(app: &AppHandle) -> Option<String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    match app.clipboard().read_text() {
        Ok(text) => {
            if text.trim().is_empty() {
                None
            } else {
                Some(text)
            }
        }
        Err(err) => {
            eprintln!("[SelectionMonitor] clipboard read failed: {err}");
            None
        }
    }
}

// ── Mouse position ────────────────────────────────────────────────────────────

/// Returns the current cursor position as (x, y).
/// Falls back to (0.0, 0.0) if the platform API is unavailable.
#[cfg(target_os = "windows")]
fn get_cursor_position() -> (f64, f64) {
    use std::mem::MaybeUninit;
    // SAFETY: POINT is a plain C struct; GetCursorPos fills it in.
    unsafe {
        #[repr(C)]
        struct POINT {
            x: i32,
            y: i32,
        }
        extern "system" {
            fn GetCursorPos(lpPoint: *mut POINT) -> i32;
        }
        let mut pt = MaybeUninit::<POINT>::uninit();
        if GetCursorPos(pt.as_mut_ptr()) != 0 {
            let pt = pt.assume_init();
            return (pt.x as f64, pt.y as f64);
        }
    }
    (0.0, 0.0)
}

// ── Selection monitor ─────────────────────────────────────────────────────────

/// Called after a left-button-up event is detected.
/// Reads the clipboard, normalises the text, and emits `text-selected`.
#[cfg(target_os = "windows")]
fn handle_mouse_release(app: &AppHandle) {
    // Small delay so the OS has time to update the clipboard after selection.
    thread::sleep(Duration::from_millis(80));

    let raw = match try_read_clipboard(app) {
        Some(t) => t,
        None => return, // nothing in clipboard – silently ignore
    };

    let (x, y) = get_cursor_position();

    let payload = match build_text_selected_payload(&raw, x, y, None, None) {
        Some(p) => p,
        None => return, // empty / whitespace-only – silently ignore
    };

    // Cache the selection for Ctrl+D quick-save
    if let Some(state) = app.try_state::<AppState>() {
        state.selection_state.remember(payload.clone());
    }

    // Emit to the Overlay window
    if let Err(err) = app.emit("text-selected", &payload) {
        eprintln!("[SelectionMonitor] emit text-selected failed: {err}");
    }

    // Show the overlay window so the Popup becomes visible
    if let Err(err) = window_manager::show_overlay_window_inner(app) {
        eprintln!("[SelectionMonitor] show overlay failed: {err}");
    }
}

/// Start the global mouse-release monitor in a background thread.
///
/// # Windows implementation
/// Uses a Win32 low-level mouse hook (`WH_MOUSE_LL`) to detect left-button-up
/// events globally, then reads the clipboard and emits `text-selected`.
///
/// # Other platforms
/// A skeleton thread is spawned but the actual hook is marked TODO.
/// The interface is complete so the rest of the application compiles and runs.
pub fn start_selection_monitor(app: AppHandle) -> Result<(), AppError> {
    let app = Arc::new(app);

    thread::Builder::new()
        .name("selection-monitor".into())
        .spawn(move || {
            run_monitor_loop(app);
        })
        .map_err(|e| AppError::Io(e.to_string()))?;

    Ok(())
}

// ── Platform-specific monitor loop ────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn run_monitor_loop(app: Arc<AppHandle>) {
    use std::ptr;

    // We store the AppHandle in a thread-local so the hook callback can reach it.
    thread_local! {
        static APP_HANDLE: std::cell::RefCell<Option<Arc<AppHandle>>> =
            std::cell::RefCell::new(None);
    }

    APP_HANDLE.with(|cell| {
        *cell.borrow_mut() = Some(Arc::clone(&app));
    });

    // Win32 type aliases (avoids pulling in the `windows` crate)
    type HHOOK = *mut std::ffi::c_void;
    type WPARAM = usize;
    type LPARAM = isize;
    type LRESULT = isize;
    type HOOKPROC = unsafe extern "system" fn(i32, WPARAM, LPARAM) -> LRESULT;

    #[repr(C)]
    struct MSLLHOOKSTRUCT {
        pt_x: i32,
        pt_y: i32,
        mouse_data: u32,
        flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    const WH_MOUSE_LL: i32 = 14;
    const WM_LBUTTONUP: usize = 0x0202;
    const HC_ACTION: i32 = 0;

    extern "system" {
        fn SetWindowsHookExW(
            id_hook: i32,
            lpfn: HOOKPROC,
            hmod: *mut std::ffi::c_void,
            dw_thread_id: u32,
        ) -> HHOOK;
        fn CallNextHookEx(
            hhk: HHOOK,
            n_code: i32,
            w_param: WPARAM,
            l_param: LPARAM,
        ) -> LRESULT;
        fn UnhookWindowsHookEx(hhk: HHOOK) -> i32;
        fn GetMessageW(
            lp_msg: *mut std::ffi::c_void,
            hwnd: *mut std::ffi::c_void,
            w_msg_filter_min: u32,
            w_msg_filter_max: u32,
        ) -> i32;
        fn TranslateMessage(lp_msg: *const std::ffi::c_void) -> i32;
        fn DispatchMessageW(lp_msg: *const std::ffi::c_void) -> LRESULT;
    }

    // The low-level mouse hook callback.
    unsafe extern "system" fn mouse_hook_proc(
        n_code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if n_code == HC_ACTION && w_param == WM_LBUTTONUP {
            APP_HANDLE.with(|cell| {
                if let Some(app) = cell.borrow().as_ref() {
                    handle_mouse_release(app);
                }
            });
        }

        // SAFETY: HOOK_HANDLE is set before the message loop starts.
        CallNextHookEx(ptr::null_mut(), n_code, w_param, l_param)
    }

    // Install the hook.
    // SAFETY: We pass a valid function pointer and NULL module handle (works for LL hooks).
    let hook = unsafe {
        SetWindowsHookExW(WH_MOUSE_LL, mouse_hook_proc, ptr::null_mut(), 0)
    };

    if hook.is_null() {
        eprintln!("[SelectionMonitor] SetWindowsHookExW failed – global mouse monitoring disabled");
        return;
    }

    eprintln!("[SelectionMonitor] Windows low-level mouse hook installed");

    // Run the Win32 message loop required to service the hook.
    // MSG is 48 bytes on 64-bit Windows; we use a byte array to avoid importing MSG.
    let mut msg = [0u8; 48];
    unsafe {
        loop {
            let ret = GetMessageW(
                msg.as_mut_ptr() as *mut _,
                ptr::null_mut(),
                0,
                0,
            );
            if ret == 0 || ret == -1 {
                break;
            }
            TranslateMessage(msg.as_ptr() as *const _);
            DispatchMessageW(msg.as_ptr() as *const _);
        }

        UnhookWindowsHookEx(hook);
    }

    eprintln!("[SelectionMonitor] message loop exited");
}

#[cfg(not(target_os = "windows"))]
fn run_monitor_loop(_app: Arc<AppHandle>) {
    // TODO: implement global mouse hook for macOS (CGEventTap) and Linux (XRecord / libinput)
    eprintln!("[SelectionMonitor] global mouse monitoring is not yet implemented on this platform");
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Quick-save the most recently cached selection directly to the task store.
/// Returns `true` if a valid cached selection was found and saved.
pub fn quick_save_cached_selection(app: &AppHandle) -> Result<bool, AppError> {
    let state = app.state::<AppState>();
    let Some(selection) = state
        .selection_state
        .latest_within(chrono::Duration::seconds(3))
    else {
        return Ok(false);
    };

    let item = state.task_store.save_item(SaveItemPayload {
        r#type: crate::types::ItemType::Todo,
        text: selection.text.clone(),
        source: selection.source.clone(),
        context: selection.context.clone(),
        tags: None,
        remind_at: None,
        ai_intent: None,
    })?;

    let _ = app.emit(
        "items-changed",
        serde_json::json!({ "type": "saved", "itemId": item.id.clone() }),
    );
    let _ = app.emit("item-saved", &item);
    let _ = app.emit(
        "quick-save-result",
        serde_json::json!({
            "status": "saved",
            "itemId": item.id,
            "message": "已快捷保存到 Inbox",
        }),
    );
    let _ = crate::reminder_scheduler::resync_scheduler(app, &state);
    let _ = window_manager::hide_overlay_window_inner(app);
    let _ = app.emit("overlay-dismissed", serde_json::json!({}));

    Ok(true)
}

#[tauri::command]
pub fn remember_selection(
    state: State<'_, AppState>,
    payload: TextSelectedPayload,
) -> Result<(), AppError> {
    state.selection_state.remember(payload);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_selected_text;
    use proptest::prelude::*;

    #[test]
    fn trims_and_rejects_whitespace_only_values() {
        assert_eq!(normalize_selected_text("   hello  "), Some("hello".to_string()));
        assert_eq!(normalize_selected_text("   \n\t  "), None);
    }

    #[test]
    fn truncates_long_text_to_500_chars() {
        let input = "a".repeat(800);
        let normalized = normalize_selected_text(&input).unwrap();
        assert_eq!(normalized.len(), 500);
    }

    proptest! {
        #[test]
        fn property_normalized_text_is_trimmed_and_bounded(input in "\\PC{0,900}") {
            let result = normalize_selected_text(&input);
            if input.trim().is_empty() {
                prop_assert!(result.is_none());
            } else if let Some(value) = result {
                prop_assert_eq!(value.trim(), value.as_str());
                prop_assert!(value.chars().count() <= 500);
            }
        }
    }
}
