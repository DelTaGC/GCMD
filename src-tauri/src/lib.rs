//! GCMD backend.
//!
//! The Rust side stays thin: file I/O, native menus, window state, settings,
//! and command-line arguments. All editing logic lives in the TypeScript
//! frontend. See `src-tauri/CLAUDE.md` for conventions.

pub mod cli;
pub mod document;
pub mod error;
pub mod menu;
pub mod paths;
pub mod settings;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::document::{Document, DocumentMeta};
use crate::error::AppError;
use crate::settings::{Settings, Theme};

/// Static information about the running application, shown in the About
/// dialog.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
}

impl AppInfo {
    /// Values come from `Cargo.toml` at compile time so they never drift from
    /// the package version.
    #[must_use]
    pub const fn current() -> Self {
        Self {
            name: "GCMD",
            version: env!("CARGO_PKG_VERSION"),
        }
    }
}

/// Process-wide state managed by Tauri. Only settings and the file to open
/// at launch live here (CLAUDE.md invariant 6).
pub struct AppState {
    settings: Mutex<Settings>,
    settings_path: PathBuf,
    /// File requested by argv or a macOS open event, consumed by `launch_args`.
    pending_open: Mutex<Option<PathBuf>>,
}

impl AppState {
    fn new(settings_path: PathBuf, settings: Settings, pending_open: Option<PathBuf>) -> Self {
        Self {
            settings: Mutex::new(settings),
            settings_path,
            pending_open: Mutex::new(pending_open),
        }
    }

    fn snapshot(&self) -> Result<Settings, AppError> {
        self.settings
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| AppError::Internal("settings lock poisoned".into()))
    }

    /// Applies `mutate`, persists the result, rebuilds the menu and returns
    /// the new settings.
    fn update<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        mutate: impl FnOnce(&mut Settings),
    ) -> Result<Settings, AppError> {
        let updated = {
            let mut guard = self
                .settings
                .lock()
                .map_err(|_| AppError::Internal("settings lock poisoned".into()))?;
            mutate(&mut guard);
            guard.clone()
        };
        settings::save(&self.settings_path, &updated)?;
        menu::install(app, &updated).map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(updated)
    }
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo::current()
}

#[tauri::command]
fn launch_args(state: State<'_, AppState>) -> Result<Option<String>, AppError> {
    let mut pending = state
        .pending_open
        .lock()
        .map_err(|_| AppError::Internal("launch lock poisoned".into()))?;
    Ok(pending.take().map(|p| cli::display_path(&p)))
}

#[tauri::command]
async fn read_document(path: String) -> Result<Document, AppError> {
    let path = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || {
        let mut doc = document::read(&path)?;
        doc.path = cli::display_path(&path);
        Ok(doc)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
}

#[tauri::command]
async fn write_document(path: String, text: String, meta: DocumentMeta) -> Result<u64, AppError> {
    let path = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || document::write(&path, &text, &meta))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    state.snapshot()
}

#[tauri::command]
fn set_theme<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    theme: Theme,
) -> Result<Settings, AppError> {
    state.update(&app, |s| s.theme = theme)
}

#[tauri::command]
fn set_sidebar_visible<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    visible: bool,
) -> Result<Settings, AppError> {
    state.update(&app, |s| s.sidebar_visible = visible)
}

#[tauri::command]
fn add_recent_file<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    path: String,
) -> Result<Settings, AppError> {
    let normalized = cli::display_path(Path::new(&path));
    state.update(&app, |s| s.push_recent(&normalized))
}

#[tauri::command]
fn remove_recent_file<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    path: String,
) -> Result<Settings, AppError> {
    let normalized = cli::display_path(Path::new(&path));
    state.update(&app, |s| s.remove_recent(&normalized))
}

#[tauri::command]
fn clear_recent_files<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Settings, AppError> {
    state.update(&app, Settings::clear_recent)
}

/// Opens a top-level menu from the keyboard (Alt+letter), see `menu.rs`.
#[tauri::command]
fn open_menu<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::Window<R>,
    id: String,
) -> Result<bool, AppError> {
    menu::popup_top_level(&app, window, &id).map_err(|e| AppError::Internal(e.to_string()))
}

#[tauri::command]
fn display_path(path: String) -> String {
    cli::display_path(Path::new(&path))
}

/// Resolves `href` relative to `base` (the open document's path) and allows the
/// result in the asset protocol scope so the webview can load it as an image.
#[tauri::command]
fn resolve_asset<R: Runtime>(
    app: AppHandle<R>,
    base: Option<String>,
    href: String,
) -> Result<String, AppError> {
    let path = paths::resolve_href(base.as_deref().map(Path::new), &href)?;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(cli::display_path(&path))
}

/// Resolves `href` relative to `base` without touching any scope (used for
/// Ctrl+click on `.md` links).
#[tauri::command]
fn resolve_path(base: Option<String>, href: String) -> Result<String, AppError> {
    let path = paths::resolve_href(base.as_deref().map(Path::new), &href)?;
    Ok(cli::display_path(&path))
}

/// Spawns another GCMD process, optionally with a file to open. One window
/// edits one file; a second file means a second process.
#[tauri::command]
fn open_new_window(path: Option<String>) -> Result<(), AppError> {
    let exe = std::env::current_exe()?;
    let mut command = std::process::Command::new(exe);
    if let Some(path) = path {
        command.arg(path);
    }
    command.spawn()?;
    Ok(())
}

/// Stores a file to open and tells the frontend about it (macOS open events
/// can arrive before or after the webview is ready; the frontend dedupes).
#[cfg(target_os = "macos")]
fn handle_open_request<R: Runtime>(app: &AppHandle<R>, path: PathBuf) {
    if let Some(state) = app.try_state::<AppState>()
        && let Ok(mut pending) = state.pending_open.lock()
    {
        *pending = Some(path.clone());
    }
    if let Err(e) = app.emit("open-file", cli::display_path(&path)) {
        eprintln!("open-file emit failed: {e}");
    }
}

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if id == menu::CLEAR_RECENT_ID {
        if let Some(state) = app.try_state::<AppState>()
            && let Err(e) = state.update(app, Settings::clear_recent)
        {
            eprintln!("clear recent failed: {e}");
        }
        return;
    }
    if let Err(e) = app.emit("menu", id) {
        eprintln!("menu emit failed: {e}");
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let settings_path = app.path().app_config_dir()?.join("settings.json");
    let settings = match settings::load(&settings_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("settings unreadable, using defaults: {e}");
            Settings::default()
        }
    };
    let cwd = std::env::current_dir()?;
    let pending = cli::file_argument(std::env::args_os().skip(1), &cwd);
    let handle = app.handle().clone();
    menu::install(&handle, &settings)?;
    app.manage(AppState::new(settings_path, settings, pending));
    Ok(())
}

/// Builds and runs the Tauri application.
///
/// # Panics
///
/// Panics if the Tauri runtime fails to start, which is unrecoverable.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(setup)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            app_info,
            launch_args,
            read_document,
            write_document,
            get_settings,
            set_theme,
            set_sidebar_visible,
            add_recent_file,
            remove_recent_file,
            clear_recent_files,
            display_path,
            open_menu,
            open_new_window,
            resolve_asset,
            resolve_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Some(path) = cli::path_from_file_url(url.as_str()) {
                    handle_open_request(app_handle, path);
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_package_version() {
        let info = AppInfo::current();
        assert_eq!(info.name, "GCMD");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
