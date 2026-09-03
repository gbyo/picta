//! Picta — show local media on a display you choose.
//!
//! The Rust side owns the things that genuinely need native behaviour: monitor
//! enumeration, window placement, narrow filesystem access and the menu.
//! Playback ordering, timing and transitions live in TypeScript, where they are
//! easy to test.

mod displays;
mod files;
mod identify;
mod presentation;
mod update;

use tauri::menu::{
    AboutMetadata, CheckMenuItemBuilder, Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem,
    SubmenuBuilder,
};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

pub const MAIN_WINDOW: &str = "main";

/// Emitted to the controller when a File-menu item is chosen.
const MENU_EVENT: &str = "picta://menu";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_displays(app: tauri::AppHandle) -> Result<Vec<displays::DisplayInfo>, String> {
    displays::enumerate(&app)
}

#[tauri::command]
async fn identify_displays(app: tauri::AppHandle) -> Result<(), String> {
    identify::show_all(app).await
}

#[tauri::command]
async fn prepare_presentation(
    app: tauri::AppHandle,
    display_id: String,
) -> Result<displays::DisplayInfo, String> {
    presentation::prepare(app, display_id).await
}

#[tauri::command]
async fn show_presentation(
    app: tauri::AppHandle,
    display_id: String,
) -> Result<displays::DisplayInfo, String> {
    presentation::show(app, display_id).await
}

#[tauri::command]
async fn close_presentation(app: tauri::AppHandle) -> Result<(), String> {
    presentation::close(&app);
    Ok(())
}

#[tauri::command]
fn allow_images(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    files::allow_images(&app, &paths)
}

#[tauri::command]
fn allow_media(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    files::allow_media(&app, &paths)
}

#[tauri::command]
fn paths_exist(paths: Vec<String>) -> Vec<bool> {
    files::paths_exist(&paths)
}

#[tauri::command]
fn read_picta(path: String) -> Result<String, String> {
    files::read_picta(&path)
}

#[tauri::command]
fn read_document(path: String) -> Result<String, String> {
    files::read_document(&path)
}

#[tauri::command]
fn write_picta(path: String, contents: String) -> Result<(), String> {
    files::write_picta(&path, &contents)
}

#[tauri::command]
fn write_document(path: String, contents: String) -> Result<(), String> {
    files::write_document(&path, &contents)
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    files::reveal_path(&path)
}

#[tauri::command]
fn load_prefs(app: tauri::AppHandle) -> serde_json::Value {
    files::load_prefs(&app)
}

#[tauri::command]
fn save_prefs(app: tauri::AppHandle, value: serde_json::Value) -> Result<(), String> {
    files::save_prefs(&app, &value)
}

#[tauri::command]
fn load_recovery(app: tauri::AppHandle) -> serde_json::Value {
    files::load_recovery(&app)
}

#[tauri::command]
fn save_recovery(app: tauri::AppHandle, value: serde_json::Value) -> Result<(), String> {
    files::save_recovery(&app, &value)
}

#[tauri::command]
fn clear_recovery(app: tauri::AppHandle) -> Result<(), String> {
    files::clear_recovery(&app)
}

#[tauri::command]
fn startup_file() -> Option<String> {
    files::startup_file()
}

/// Which path conventions this machine uses, so the frontend's pure path logic
/// picks the right separator and root rules.
#[tauri::command]
fn path_style() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else {
        "posix"
    }
}

/// Quit after the controller has resolved any unsaved-changes prompt.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    shutdown(&app);
    app.exit(0);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/// Whether automatic update checking is switched on, defaulting to on.
fn update_checks_enabled(app: &tauri::AppHandle) -> bool {
    files::load_prefs(app)
        .get("updateChecks")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true)
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let new_item = MenuItemBuilder::with_id("new", "New")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("open", "Open…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let save_item = MenuItemBuilder::with_id("save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as_item = MenuItemBuilder::with_id("save-as", "Save As…")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;

    let check_updates_item =
        MenuItemBuilder::with_id("check-updates", "Check for Updates…").build(app)?;
    let auto_updates_item =
        CheckMenuItemBuilder::with_id("auto-update-checks", "Check for Updates Automatically")
            .checked(update_checks_enabled(app))
            .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_item)
        .item(&open_item)
        .separator()
        .item(&save_item)
        .item(&save_as_item)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close"))?)
        .build()?;

    #[cfg(not(target_os = "macos"))]
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&check_updates_item)
        .item(&auto_updates_item)
        .build()?;

    let menu = Menu::new(app)?;

    // macOS puts the application submenu first and expects the standard items.
    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "Picta")
            .item(&PredefinedMenuItem::about(
                app,
                Some("About Picta"),
                Some(AboutMetadata::default()),
            )?)
            .separator()
            .item(&check_updates_item)
            .item(&auto_updates_item)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?;
        menu.append(&app_menu)?;
    }

    menu.append(&file_menu)?;

    #[cfg(not(target_os = "macos"))]
    menu.append(&help_menu)?;

    #[cfg(target_os = "macos")]
    {
        // Without an Edit submenu macOS drops copy/paste in text fields.
        let edit_menu = SubmenuBuilder::new(app, "Edit")
            .item(&PredefinedMenuItem::undo(app, None)?)
            .item(&PredefinedMenuItem::redo(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::cut(app, None)?)
            .item(&PredefinedMenuItem::copy(app, None)?)
            .item(&PredefinedMenuItem::paste(app, None)?)
            .item(&PredefinedMenuItem::select_all(app, None)?)
            .build()?;
        menu.append(&edit_menu)?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = AboutMetadata::default();

    Ok(menu)
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/// Tear down everything that could otherwise be left on a screen.
///
/// Called when the controller closes, when the app exits, and on quit. A
/// borderless always-on-top fullscreen window that outlives its controller
/// would be unclosable without the task manager, so this runs on every path out.
fn shutdown(app: &tauri::AppHandle) {
    presentation::close(app);
    identify::close_all(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_displays,
            identify_displays,
            prepare_presentation,
            show_presentation,
            close_presentation,
            allow_images,
            allow_media,
            paths_exist,
            read_picta,
            read_document,
            write_picta,
            write_document,
            reveal_path,
            load_prefs,
            save_prefs,
            load_recovery,
            save_recovery,
            clear_recovery,
            startup_file,
            path_style,
            quit_app,
            update::check_for_update,
            update::open_releases_page,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let menu = build_menu(&handle)?;

            #[cfg(target_os = "macos")]
            app.set_menu(menu)?;

            #[cfg(not(target_os = "macos"))]
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                window.set_menu(menu)?;
            }

            app.on_menu_event(move |app, event| {
                let id = event.id().0.as_str();

                // A check item does not toggle its own tick, so flip it here and
                // tell the controller what the new value is.
                if id == "auto-update-checks" {
                    if let Some(MenuItemKind::Check(item)) =
                        app.menu().and_then(|menu| menu.get(id))
                    {
                        let enabled = !item.is_checked().unwrap_or(true);
                        let _ = item.set_checked(enabled);
                        let _ = app.emit(
                            MENU_EVENT,
                            if enabled {
                                "update-checks-on"
                            } else {
                                "update-checks-off"
                            },
                        );
                    }
                    return;
                }

                let _ = app.emit(MENU_EVENT, id);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Losing the controller must never leave the presentation running.
            if window.label() == MAIN_WINDOW {
                if let WindowEvent::Destroyed = event {
                    shutdown(&window.app_handle().clone());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while starting Picta")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                shutdown(app);
            }
        });
}
