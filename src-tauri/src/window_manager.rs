use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri::{LogicalPosition, LogicalSize};

use crate::{error::AppError, types::StickyState};

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const OVERLAY_WINDOW_LABEL: &str = "overlay";
pub const TASK_MANAGER_WINDOW_LABEL: &str = "main";
pub const SPOTLIGHT_WINDOW_LABEL: &str = "spotlight";
pub const SCREENSHOT_WINDOW_LABEL: &str = "screenshot-ocr";
pub const STICKY_WINDOW_PREFIX: &str = "sticky-";
pub const POPUP_WIDTH: u32 = 576;
pub const POPUP_HEIGHT: u32 = 460;
pub const POPUP_OFFSET_Y: u32 = 12;
pub const POPUP_MARGIN: u32 = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PopupPosition {
    pub x: u32,
    pub y: u32,
}

pub fn calculate_popup_position(
    mouse_x: u32,
    mouse_y: u32,
    screen_w: u32,
    screen_h: u32,
) -> PopupPosition {
    let max_x = screen_w
        .saturating_sub(POPUP_WIDTH + POPUP_MARGIN)
        .max(POPUP_MARGIN);
    let max_y = screen_h
        .saturating_sub(POPUP_HEIGHT + POPUP_MARGIN)
        .max(POPUP_MARGIN);

    let mut x = mouse_x;
    let mut y = mouse_y.saturating_add(POPUP_OFFSET_Y);

    if x.saturating_add(POPUP_WIDTH) > screen_w.saturating_sub(POPUP_MARGIN) {
        x = max_x;
    }

    if y.saturating_add(POPUP_HEIGHT) > screen_h.saturating_sub(POPUP_MARGIN) {
        y = mouse_y
            .saturating_sub(POPUP_HEIGHT)
            .saturating_sub(POPUP_OFFSET_Y)
            .max(POPUP_MARGIN);
    }

    PopupPosition {
        x: x.clamp(POPUP_MARGIN, max_x),
        y: y.clamp(POPUP_MARGIN, max_y),
    }
}

// ── Overlay ───────────────────────────────────────────────────────────────

fn create_overlay_window(app: &AppHandle) -> Result<WebviewWindow, AppError> {
    let window = WebviewWindowBuilder::new(
        app,
        OVERLAY_WINDOW_LABEL,
        WebviewUrl::App("index.html#overlay".into()),
    )
    .title("TextClip Overlay")
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .visible(false)
    .fullscreen(true)
    .build()
    .map_err(|e| AppError::Window(e.to_string()))?;

    window
        .set_ignore_cursor_events(true)
        .map_err(|e| AppError::Window(e.to_string()))?;

    Ok(window)
}

fn ensure_overlay_window(app: &AppHandle) -> Result<WebviewWindow, AppError> {
    if let Some(w) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        return Ok(w);
    }
    create_overlay_window(app)
}

// ── Main / Task-Manager window ────────────────────────────────────────────

/// Show and focus the main task-manager window.
/// Used by tray menu, notification click, and Spotlight jump.
pub fn show_task_manager_window_inner(
    app: &AppHandle,
    item_id: Option<String>,
) -> Result<(), AppError> {
    if let Some(w) = app.get_webview_window(TASK_MANAGER_WINDOW_LABEL) {
        w.show().map_err(|e| AppError::Window(e.to_string()))?;
        w.set_focus().map_err(|e| AppError::Window(e.to_string()))?;
    }
    if let Some(item_id) = item_id {
        let _ = app.emit("task-manager-focus-item", serde_json::json!({ "itemId": item_id }));
    }
    Ok(())
}

/// Hide (not close) the main task-manager window.
/// Called from the close-event handler so the app keeps running in the tray.
pub fn hide_task_manager_window_inner(app: &AppHandle) -> Result<(), AppError> {
    if let Some(w) = app.get_webview_window(TASK_MANAGER_WINDOW_LABEL) {
        w.hide().map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

// ── Spotlight window ──────────────────────────────────────────────────────

fn ensure_spotlight_window(app: &AppHandle) -> Result<WebviewWindow, AppError> {
    if let Some(w) = app.get_webview_window(SPOTLIGHT_WINDOW_LABEL) {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(
        app,
        SPOTLIGHT_WINDOW_LABEL,
        WebviewUrl::App("index.html#spotlight".into()),
    )
    .title("TextClip Search")
    .decorations(false)
    .shadow(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .visible(false)
    .inner_size(640.0, 480.0)
    .build()
    .map_err(|e| AppError::Window(e.to_string()))?;
    Ok(w)
}

fn ensure_screenshot_window(app: &AppHandle) -> Result<WebviewWindow, AppError> {
    if let Some(w) = app.get_webview_window(SCREENSHOT_WINDOW_LABEL) {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(
        app,
        SCREENSHOT_WINDOW_LABEL,
        WebviewUrl::App("index.html#screenshot-ocr".into()),
    )
    .title("TextClip Screenshot OCR")
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .visible(false)
    .fullscreen(true)
    .build()
    .map_err(|e| AppError::Window(e.to_string()))?;
    Ok(w)
}

pub fn show_spotlight_window_inner(app: &AppHandle) -> Result<(), AppError> {
    let w = ensure_spotlight_window(app)?;
    w.show().map_err(|e| AppError::Window(e.to_string()))?;
    w.set_focus().map_err(|e| AppError::Window(e.to_string()))?;
    Ok(())
}

pub fn hide_spotlight_window_inner(app: &AppHandle) -> Result<(), AppError> {
    if let Some(w) = app.get_webview_window(SPOTLIGHT_WINDOW_LABEL) {
        w.hide().map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

// ── Initialisation ────────────────────────────────────────────────────────

pub fn initialize_windows(app: &AppHandle) -> Result<(), AppError> {
    // Overlay: hidden, passthrough on
    let overlay = ensure_overlay_window(app)?;
    overlay.hide().map_err(|e| AppError::Window(e.to_string()))?;
    overlay
        .set_ignore_cursor_events(true)
        .map_err(|e| AppError::Window(e.to_string()))?;

    // Spotlight: pre-create so first show is instant
    let _ = ensure_spotlight_window(app)?;
    let screenshot = ensure_screenshot_window(app)?;
    screenshot.hide().map_err(|e| AppError::Window(e.to_string()))?;

    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn show_overlay_window(app: AppHandle) -> Result<(), AppError> {
    show_overlay_window_inner(&app)
}

#[tauri::command]
pub fn hide_overlay_window(app: AppHandle) -> Result<(), AppError> {
    hide_overlay_window_inner(&app)
}

/// Alias kept for forward-compat with frontend invoke names
#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), AppError> {
    show_overlay_window_inner(&app)
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), AppError> {
    hide_overlay_window_inner(&app)
}

#[tauri::command]
pub fn toggle_cursor_passthrough(app: AppHandle, passthrough: bool) -> Result<(), AppError> {
    if let Some(w) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        w.set_ignore_cursor_events(passthrough)
            .map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_task_manager_window(app: AppHandle, item_id: Option<String>) -> Result<(), AppError> {
    show_task_manager_window_inner(&app, item_id)
}

#[tauri::command]
pub fn show_screenshot_window(app: AppHandle) -> Result<(), AppError> {
    show_screenshot_window_inner(&app)
}

#[tauri::command]
pub fn hide_screenshot_window(app: AppHandle) -> Result<(), AppError> {
    hide_screenshot_window_inner(&app)
}

#[tauri::command]
pub fn show_spotlight(app: AppHandle) -> Result<(), AppError> {
    show_spotlight_window_inner(&app)
}

#[tauri::command]
pub fn hide_spotlight(app: AppHandle) -> Result<(), AppError> {
    hide_spotlight_window_inner(&app)
}

// ── Internal helpers (re-exported for lib.rs) ─────────────────────────────

pub fn show_overlay_window_inner(app: &AppHandle) -> Result<(), AppError> {
    let overlay = ensure_overlay_window(app)?;
    overlay.show().map_err(|e| AppError::Window(e.to_string()))?;
    overlay
        .set_focus()
        .map_err(|e| AppError::Window(e.to_string()))?;
    overlay
        .set_ignore_cursor_events(false)
        .map_err(|e| AppError::Window(e.to_string()))?;
    Ok(())
}

pub fn hide_overlay_window_inner(app: &AppHandle) -> Result<(), AppError> {
    if let Some(overlay) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        overlay
            .set_ignore_cursor_events(true)
            .map_err(|e| AppError::Window(e.to_string()))?;
        overlay
            .hide()
            .map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

pub fn show_screenshot_window_inner(app: &AppHandle) -> Result<(), AppError> {
    let screenshot = ensure_screenshot_window(app)?;
    screenshot.show().map_err(|e| AppError::Window(e.to_string()))?;
    screenshot
        .set_focus()
        .map_err(|e| AppError::Window(e.to_string()))?;
    Ok(())
}

pub fn hide_screenshot_window_inner(app: &AppHandle) -> Result<(), AppError> {
    if let Some(screenshot) = app.get_webview_window(SCREENSHOT_WINDOW_LABEL) {
        screenshot
            .hide()
            .map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

pub fn configure_screenshot_window_bounds(
    app: &AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), AppError> {
    let screenshot = ensure_screenshot_window(app)?;
    screenshot
        .set_position(LogicalPosition::new(x as f64, y as f64))
        .map_err(|e| AppError::Window(e.to_string()))?;
    screenshot
        .set_size(LogicalSize::new(width as f64, height as f64))
        .map_err(|e| AppError::Window(e.to_string()))?;
    Ok(())
}

fn sticky_window_label(id: &str) -> String {
    format!("{STICKY_WINDOW_PREFIX}{id}")
}

pub fn show_sticky_window(app: &AppHandle, sticky: &StickyState) -> Result<(), AppError> {
    let label = sticky_window_label(&sticky.id);
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e| AppError::Window(e.to_string()))?;
        window.set_focus().map_err(|e| AppError::Window(e.to_string()))?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html#sticky".into()))
        .title("TextClip Sticky")
        .decorations(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(300.0, 220.0)
        .position(sticky.x, sticky.y)
        .build()
        .map_err(|e| AppError::Window(e.to_string()))?;

    let app_handle = app.clone();
    let sticky_id = sticky.id.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            let _ = crate::sticky_store::mark_sticky_visible(&app_handle, &sticky_id, false);
        }
    });

    window.show().map_err(|e| AppError::Window(e.to_string()))?;
    Ok(())
}

pub fn close_sticky_window(app: &AppHandle, sticky_id: &str) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(&sticky_window_label(sticky_id)) {
        window.close().map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn clamps_popup_inside_screen_bounds() {
        let position = calculate_popup_position(1900, 1040, 1920, 1080);
        assert!(position.x >= POPUP_MARGIN);
        assert!(position.y >= POPUP_MARGIN);
        assert!(position.x + POPUP_WIDTH <= 1920 - POPUP_MARGIN + POPUP_MARGIN);
    }

    #[test]
    fn flips_popup_upwards_when_bottom_space_is_insufficient() {
        let position = calculate_popup_position(300, 1000, 1440, 1024);
        assert!(position.y <= 1000);
    }

    proptest! {
        #[test]
        fn property_popup_position_stays_on_screen(
            mouse_x in 0u32..4000,
            mouse_y in 0u32..2500,
            screen_w in 640u32..4096,
            screen_h in 480u32..2160
        ) {
            let position = calculate_popup_position(mouse_x, mouse_y, screen_w, screen_h);
            let max_x = screen_w.saturating_sub(POPUP_WIDTH + POPUP_MARGIN).max(POPUP_MARGIN);
            let max_y = screen_h.saturating_sub(POPUP_HEIGHT + POPUP_MARGIN).max(POPUP_MARGIN);

            prop_assert!(position.x >= POPUP_MARGIN);
            prop_assert!(position.y >= POPUP_MARGIN);
            prop_assert!(position.x <= max_x);
            prop_assert!(position.y <= max_y);
        }
    }
}
