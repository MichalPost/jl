"""
Task 9.1 / 9.2 / 9.3 implementation script.
Writes updated Rust source files for:
  - 9.1  System tray icon & menu  (already scaffolded in lib.rs, verify/complete)
  - 9.2  Close-to-hide for main window
  - 9.3  Unified multi-window manager
"""

import pathlib, textwrap

ROOT = pathlib.Path(__file__).parent.parent

# ─────────────────────────────────────────────────────────────────────────────
# window_manager.rs  (tasks 9.2 + 9.3)
# ─────────────────────────────────────────────────────────────────────────────

WINDOW_MANAGER = textwrap.dedent("""\
    use tauri::{
        AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    };

    use crate::error::AppError;

    pub const MAIN_WINDOW_LABEL: &str = "main";
    pub const OVERLAY_WINDOW_LABEL: &str = "overlay";
    pub const TASK_MANAGER_WINDOW_LABEL: &str = "main";
    pub const SPOTLIGHT_WINDOW_LABEL: &str = "spotlight";
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
        .transparent(true)
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
    pub fn show_task_manager_window_inner(app: &AppHandle) -> Result<(), AppError> {
        if let Some(w) = app.get_webview_window(TASK_MANAGER_WINDOW_LABEL) {
            w.show().map_err(|e| AppError::Window(e.to_string()))?;
            w.set_focus().map_err(|e| AppError::Window(e.to_string()))?;
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
        .transparent(true)
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
    pub fn show_task_manager_window(app: AppHandle) -> Result<(), AppError> {
        show_task_manager_window_inner(&app)
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
""")

# ─────────────────────────────────────────────────────────────────────────────
# lib.rs  — add close-to-hide handler + new tray commands
# ─────────────────────────────────────────────────────────────────────────────

LIB_RS = textwrap.dedent("""\
    mod ai_analyzer;
    mod context_extractor;
    mod error;
    mod ocr;
    mod plugin_manager;
    mod reminder_scheduler;
    mod selection_monitor;
    mod sticky_store;
    mod task_store;
    mod types;
    mod window_manager;

    use tauri::Manager;
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri_plugin_global_shortcut::ShortcutState;
    use task_store::{AppPaths, AppState, SettingsStore, TaskStore};

    fn normalize_shortcut(shortcut: &str) -> String {
        shortcut
            .replace("CommandOrControl", "ctrl")
            .replace("Control", "ctrl")
            .replace("Ctrl", "ctrl")
            .replace("Alt", "alt")
            .replace("Shift", "shift")
            .replace(" ", "")
            .to_lowercase()
    }

    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_clipboard_manager::init())
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_store::Builder::default().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))
            .setup(|app| {
                let app_handle = app.handle().clone();
                let paths = AppPaths::resolve(&app_handle)?;
                TaskStore::ensure_storage(&paths)?;

                app.manage(AppState {
                    task_store: TaskStore::new(paths.items_file.clone()),
                    settings_store: SettingsStore::new(paths.settings_file.clone()),
                    selection_state: selection_monitor::SelectionState::default(),
                });

                let quick_save_shortcut =
                    normalize_shortcut(&app.state::<AppState>().settings_store.get_settings()?.quick_save_hotkey);
                let quick_save_shortcut_match = quick_save_shortcut.clone();

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts([quick_save_shortcut.as_str()])?
                        .with_handler(move |app, shortcut, event| {
                            if event.state == ShortcutState::Pressed
                                && shortcut.to_string().to_lowercase() == quick_save_shortcut_match
                            {
                                let _ = selection_monitor::quick_save_cached_selection(app);
                            }
                        })
                        .build(),
                )?;

                window_manager::initialize_windows(&app_handle)?;
                selection_monitor::start_selection_monitor(app_handle.clone())?;
                reminder_scheduler::initialize_scheduler()?;

                // ── 9.1  System tray icon & menu ──────────────────────────────
                let open_item = MenuItem::with_id(app, "open", "打开任务列表", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
                let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                let mut tray_builder = TrayIconBuilder::new()
                    .menu(&tray_menu)
                    .menu_on_left_click(false)
                    .tooltip("TextClip")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => {
                            let _ = window_manager::show_task_manager_window_inner(app);
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let _ = window_manager::show_task_manager_window_inner(tray.app_handle());
                        }
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }

                let _tray = tray_builder.build(app)?;

                // ── 9.2  Show main window; wire close-to-hide ─────────────────
                if let Some(main_win) = app.get_webview_window(window_manager::MAIN_WINDOW_LABEL) {
                    main_win.show().ok();

                    // Intercept the close event: hide instead of destroying the window
                    // so background monitoring, tray and reminders keep running.
                    let app_handle_for_close = app_handle.clone();
                    main_win.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = window_manager::hide_task_manager_window_inner(
                                &app_handle_for_close,
                            );
                        }
                    });
                }

                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                task_store::save_item,
                task_store::update_item,
                task_store::delete_item,
                task_store::list_items,
                task_store::search_items,
                task_store::get_settings,
                task_store::save_settings,
                ai_analyzer::analyze_intent,
                ocr::start_screenshot_ocr,
                sticky_store::create_sticky,
                sticky_store::close_sticky,
                sticky_store::list_stickies,
                sticky_store::update_sticky_position,
                plugin_manager::list_plugins,
                plugin_manager::toggle_plugin,
                selection_monitor::remember_selection,
                window_manager::show_overlay,
                window_manager::hide_overlay,
                window_manager::show_overlay_window,
                window_manager::hide_overlay_window,
                window_manager::toggle_cursor_passthrough,
                window_manager::show_task_manager_window,
                window_manager::show_spotlight,
                window_manager::hide_spotlight,
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
""")

# ── write files ───────────────────────────────────────────────────────────────

files = {
    ROOT / "src-tauri/src/window_manager.rs": WINDOW_MANAGER,
    ROOT / "src-tauri/src/lib.rs": LIB_RS,
}

for path, content in files.items():
    path.write_text(content, encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}")

print("done")
