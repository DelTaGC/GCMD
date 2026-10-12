//! GCMD backend.
//!
//! The Rust side stays thin: file I/O, file watching, native menus, window
//! state, settings, and command-line arguments. All editing logic lives in
//! the TypeScript frontend. See `src-tauri/CLAUDE.md` for conventions.

use serde::Serialize;

/// Static information about the running application, shown by the frontend
/// placeholder in phase 1 and in the About dialog later.
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

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo::current()
}

/// Builds and runs the Tauri application.
///
/// # Panics
///
/// Panics if the Tauri runtime fails to start, which is unrecoverable.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
