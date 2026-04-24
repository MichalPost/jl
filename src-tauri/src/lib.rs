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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let app_handle = app.handle().clone();
            let paths = AppPaths::resolve(&app_handle)?;
            TaskStore::ensure_storage(&paths)?;

            app.manage(AppState {
                task_store: TaskStore::new(paths.items_file.clone(), paths.projects_file.clone()),
                settings_store: SettingsStore::new(paths.settings_file.clone()),
                selection_state: selection_monitor::SelectionState::default(),
                screenshot_session_state: ocr::ScreenshotSessionState::default(),
            });

            let settings = app.state::<AppState>().settings_store.get_settings()?;
            let quick_save_shortcut =
                normalize_shortcut(&settings.quick_save_hotkey);
            let quick_save_shortcut_match = quick_save_shortcut.clone();
            let screenshot_shortcut =
                normalize_shortcut(&settings.screenshot_hotkey);
            let screenshot_shortcut_match = screenshot_shortcut.clone();
            let spotlight_shortcut =
                normalize_shortcut(&settings.spotlight_hotkey);
            let spotlight_shortcut_match = spotlight_shortcut.clone();

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts([
                        quick_save_shortcut.as_str(),
                        screenshot_shortcut.as_str(),
                        spotlight_shortcut.as_str(),
                    ])?
                    .with_handler(move |app, shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let shortcut_value = shortcut.to_string().to_lowercase();
                            if shortcut_value == quick_save_shortcut_match {
                                let _ = selection_monitor::quick_save_cached_selection(app);
                            }
                            if shortcut_value == screenshot_shortcut_match {
                                let state = app.state::<AppState>();
                                let _ = ocr::start_screenshot_selection_inner(app, &state);
                            }
                            if shortcut_value == spotlight_shortcut_match {
                                let _ = window_manager::show_spotlight_window_inner(app);
                            }
                        }
                    })
                    .build(),
            )?;

            window_manager::initialize_windows(&app_handle)?;
            selection_monitor::start_selection_monitor(app_handle.clone())?;
            reminder_scheduler::initialize_scheduler(&app_handle, &app.state::<AppState>())?;
            sticky_store::restore_visible_stickies(&app_handle)?;

            // ── 9.1  System tray icon & menu ──────────────────────────────
            let open_item = MenuItem::with_id(app, "open", "打开任务列表", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("TextClip")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        let _ = window_manager::show_task_manager_window_inner(app, None);
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
                        let _ = window_manager::show_task_manager_window_inner(tray.app_handle(), None);
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
            task_store::list_projects,
            task_store::create_project,
            task_store::update_project,
            task_store::delete_project,
            task_store::get_settings,
            task_store::save_settings,
            ai_analyzer::analyze_intent,
            ocr::list_ocr_providers,
            ocr::start_screenshot_ocr,
            ocr::start_screenshot_selection,
            ocr::get_pending_screenshot_session,
            ocr::cancel_screenshot_selection,
            sticky_store::create_sticky,
            sticky_store::close_sticky,
            sticky_store::list_stickies,
            sticky_store::update_sticky_position,
            plugin_manager::list_plugins,
            plugin_manager::toggle_plugin,
            plugin_manager::get_plugin_entry_code,
            selection_monitor::remember_selection,
            window_manager::show_overlay,
            window_manager::hide_overlay,
            window_manager::show_overlay_window,
            window_manager::hide_overlay_window,
            window_manager::toggle_cursor_passthrough,
            window_manager::show_task_manager_window,
            window_manager::show_screenshot_window,
            window_manager::hide_screenshot_window,
            window_manager::show_spotlight,
            window_manager::hide_spotlight,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
