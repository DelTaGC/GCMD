//! Versioned settings stored as JSON in the OS app-config directory.
//!
//! Settings are migrated forward on load and never deleted by an update.
//! Keys this version does not know are kept verbatim in [`Settings::extra`]
//! so a newer or older build never drops user data.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Current settings schema version.
pub const SCHEMA_VERSION: u32 = 1;
/// Maximum number of entries kept in the recent-files list.
pub const MAX_RECENT_FILES: usize = 10;

/// Color theme preference.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// Always light.
    Light,
    /// Always dark.
    Dark,
    /// Follow the operating system.
    #[default]
    System,
}

/// Persisted user settings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Schema version of the file this was read from (never downgraded).
    pub schema_version: u32,
    /// Theme preference.
    pub theme: Theme,
    /// Most recently opened files, newest first.
    pub recent_files: Vec<String>,
    /// Whether the outline sidebar is shown.
    pub sidebar_visible: bool,
    /// Keys from newer or unknown versions, preserved verbatim so an update never drops a user's data.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            theme: Theme::System,
            recent_files: Vec::new(),
            sidebar_visible: false,
            extra: serde_json::Map::new(),
        }
    }
}

fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.to_lowercase() == b.to_lowercase()
    } else {
        a == b
    }
}

impl Settings {
    /// Moves `path` to the front of the recent list, removing duplicates
    /// (case-insensitive on Windows) and truncating to [`MAX_RECENT_FILES`].
    pub fn push_recent(&mut self, path: &str) {
        self.recent_files.retain(|p| !same_path(p, path));
        self.recent_files.insert(0, path.to_string());
        self.recent_files.truncate(MAX_RECENT_FILES);
    }

    /// Removes `path` from the recent list (case-insensitive on Windows).
    pub fn remove_recent(&mut self, path: &str) {
        self.recent_files.retain(|p| !same_path(p, path));
    }

    /// Empties the recent list.
    pub fn clear_recent(&mut self) {
        self.recent_files.clear();
    }
}

/// Brings settings read from disk up to the current schema.
///
/// Future migrations go here: match on `settings.schema_version` and step the
/// version forward one release at a time. A version newer than
/// [`SCHEMA_VERSION`] is left untouched so it is never downgraded.
fn migrate(mut settings: Settings) -> Settings {
    if settings.schema_version == 0 {
        // Files written before versioning existed are treated as v1.
        settings.schema_version = SCHEMA_VERSION;
    }
    settings
}

/// Parses settings JSON and migrates it to the current schema.
///
/// Missing fields take their defaults and unknown keys are preserved.
pub fn parse(json: &str) -> Result<Settings, AppError> {
    let settings: Settings = serde_json::from_str(json)
        .map_err(|e| AppError::Settings(format!("Invalid settings file: {e}")))?;
    Ok(migrate(settings))
}

/// Loads settings from `path`; a missing file yields the defaults.
pub fn load(path: &Path) -> Result<Settings, AppError> {
    match fs::read_to_string(path) {
        Ok(json) => parse(&json),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Settings::default()),
        Err(e) => Err(AppError::Settings(format!("Cannot read settings: {e}"))),
    }
}

/// Saves settings as pretty JSON with a trailing newline, creating parent
/// directories as needed.
pub fn save(path: &Path, settings: &Settings) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut json = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::Settings(format!("Cannot serialize settings: {e}")))?;
    json.push('\n');
    fs::write(path, json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_serialize_camel_case_with_version() {
        let value = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(value["schemaVersion"], 1);
        assert_eq!(value["theme"], "system");
        assert_eq!(value["recentFiles"], serde_json::json!([]));
        assert_eq!(value["sidebarVisible"], false);
    }

    #[test]
    fn schema_version_is_serialized_first() {
        let json = serde_json::to_string(&Settings::default()).unwrap();
        assert!(json.starts_with(r#"{"schemaVersion":1,"#));
    }

    #[test]
    fn parse_empty_object_gives_defaults() {
        assert_eq!(parse("{}").unwrap(), Settings::default());
    }

    #[test]
    fn parse_zero_version_becomes_current() {
        let s = parse(r#"{"schemaVersion":0,"theme":"dark"}"#).unwrap();
        assert_eq!(s.schema_version, SCHEMA_VERSION);
        assert_eq!(s.theme, Theme::Dark);
    }

    #[test]
    fn parse_keeps_unknown_keys_and_newer_version() {
        let json = r#"{"schemaVersion":7,"futureThing":{"a":[1,2]},"theme":"light"}"#;
        let s = parse(json).unwrap();
        assert_eq!(s.schema_version, 7);
        assert_eq!(s.theme, Theme::Light);
        let back = serde_json::to_value(&s).unwrap();
        assert_eq!(back["schemaVersion"], 7);
        assert_eq!(back["futureThing"], serde_json::json!({"a": [1, 2]}));
    }

    #[test]
    fn parse_invalid_json_is_settings_error() {
        assert!(matches!(parse("{nope"), Err(AppError::Settings(_))));
    }

    #[test]
    fn push_recent_moves_to_front_and_dedupes() {
        let mut s = Settings::default();
        s.push_recent("/a");
        s.push_recent("/b");
        s.push_recent("/a");
        assert_eq!(s.recent_files, ["/a", "/b"]);
    }

    #[test]
    fn push_recent_truncates() {
        let mut s = Settings::default();
        for i in 0..15 {
            s.push_recent(&format!("/f{i}"));
        }
        assert_eq!(s.recent_files.len(), MAX_RECENT_FILES);
        assert_eq!(s.recent_files[0], "/f14");
        assert_eq!(s.recent_files[MAX_RECENT_FILES - 1], "/f5");
    }

    #[test]
    fn remove_and_clear_recent() {
        let mut s = Settings::default();
        s.push_recent("/a");
        s.push_recent("/b");
        s.remove_recent("/a");
        assert_eq!(s.recent_files, ["/b"]);
        s.clear_recent();
        assert_eq!(s.recent_files.len(), 0);
    }

    #[cfg(windows)]
    #[test]
    fn push_recent_is_case_insensitive_on_windows() {
        let mut s = Settings::default();
        s.push_recent(r"C:\Docs\Note.md");
        s.push_recent(r"C:\Other.md");
        s.push_recent(r"c:\docs\note.md");
        assert_eq!(s.recent_files, [r"c:\docs\note.md", r"C:\Other.md"]);
    }

    #[test]
    fn load_missing_file_gives_default() {
        let dir = tempfile::tempdir().unwrap();
        let s = load(&dir.path().join("settings.json")).unwrap();
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn save_then_load_round_trips_creating_directories() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir
            .path()
            .join("nested")
            .join("deeper")
            .join("settings.json");
        let mut s = Settings {
            theme: Theme::Dark,
            sidebar_visible: true,
            ..Settings::default()
        };
        s.push_recent("/a.md");
        s.extra.insert("custom".to_string(), serde_json::json!(42));
        save(&path, &s).unwrap();
        assert!(fs::read_to_string(&path).unwrap().ends_with("}\n"));
        assert_eq!(load(&path).unwrap(), s);
    }

    #[test]
    fn load_invalid_file_is_settings_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "not json").unwrap();
        assert!(matches!(load(&path), Err(AppError::Settings(_))));
    }
}
