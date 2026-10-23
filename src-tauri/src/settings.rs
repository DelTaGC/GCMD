//! Versioned settings stored as JSON in the OS app-config directory.
//!
//! Settings are migrated forward on load and never deleted by an update.
//! Keys this version does not know are kept verbatim in [`Settings::extra`]
//! so a newer or older build never drops user data.

use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Current settings schema version.
pub const SCHEMA_VERSION: u32 = 1;
/// Maximum number of entries kept in the recent-files list.
pub const MAX_RECENT_FILES: usize = 10;
/// Default editor text size, in CSS pixels.
pub const DEFAULT_FONT_SIZE: u32 = 16;
/// Smallest editor text size View > Zoom can set.
pub const MIN_FONT_SIZE: u32 = 8;
/// Largest editor text size View > Zoom can set.
pub const MAX_FONT_SIZE: u32 = 72;

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

/// When to look for updates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateCheck {
    /// In the background after startup, at most once a day.
    #[default]
    Auto,
    /// Only from Help > Check for Updates.
    Manual,
}

/// Update preferences and bookkeeping (ADR 0010).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateSettings {
    pub check: UpdateCheck,
    /// Time of the last completed check, in Unix milliseconds.
    pub last_check_ms: Option<u64>,
    /// A version the user chose to skip; automatic checks stay quiet about it.
    pub skipped_version: Option<String>,
}

/// How long lines wrap.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WrapMode {
    /// No wrapping; long lines scroll horizontally.
    Off,
    /// Wrap at the window width minus the margins.
    #[default]
    Full,
    /// Wrap at a fixed text width, centered.
    Fixed,
}

/// Line wrap preferences. Sizes are CSS pixels; the frontend clamps them to
/// the window when it lays out the text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WrapSettings {
    pub mode: WrapMode,
    /// Text width in [`WrapMode::Fixed`].
    pub width: u32,
    /// Margin on each side in [`WrapMode::Full`] and [`WrapMode::Off`].
    pub margin: u32,
}

impl Default for WrapSettings {
    fn default() -> Self {
        Self {
            mode: WrapMode::Full,
            width: 832,
            margin: 40,
        }
    }
}

/// Fonts, code size, line height and colors (Phase 7 settings panel). Empty
/// font names and absent colors mean the built-in defaults in
/// `src/styles.css`. The text size itself is [`Settings::font_size`] (View >
/// Zoom), which the panel also edits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppearanceSettings {
    /// CSS font-family list for the text; empty for the system UI font.
    pub text_font: String,
    /// CSS font-family list for code; empty for the default monospace stack.
    pub code_font: String,
    /// Code size in percent of the text size.
    pub code_font_scale: u32,
    /// Line height in percent of the font size.
    pub line_height: u32,
    /// Color overrides for the light theme: CSS variable name without the
    /// leading dashes (`bg`, `link`...) to `#rrggbb`.
    pub light_colors: BTreeMap<String, String>,
    /// Color overrides for the dark theme, same shape as `light_colors`.
    pub dark_colors: BTreeMap<String, String>,
}

/// Limits enforced by [`AppearanceSettings::sanitized`].
pub const CODE_FONT_SCALE_RANGE: (u32, u32) = (50, 150);
pub const LINE_HEIGHT_RANGE: (u32, u32) = (100, 250);
const MAX_FONT_NAME: usize = 200;

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            text_font: String::new(),
            code_font: String::new(),
            code_font_scale: 90,
            line_height: 160,
            light_colors: BTreeMap::new(),
            dark_colors: BTreeMap::new(),
        }
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn is_color_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 40
        && key
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn sanitize_font(name: &str) -> String {
    name.chars()
        .filter(|c| !matches!(c, ';' | '{' | '}' | '<' | '>' | '\\') && !c.is_control())
        .take(MAX_FONT_NAME)
        .collect::<String>()
        .trim()
        .to_string()
}

fn sanitize_colors(colors: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    colors
        .iter()
        .filter(|(k, v)| is_color_key(k) && is_hex_color(v))
        .map(|(k, v)| (k.clone(), v.to_ascii_lowercase()))
        .collect()
}

impl AppearanceSettings {
    /// Clamps sizes, drops invalid colors and strips characters that could
    /// break out of a CSS value from the font names.
    #[must_use]
    pub fn sanitized(&self) -> Self {
        Self {
            text_font: sanitize_font(&self.text_font),
            code_font: sanitize_font(&self.code_font),
            code_font_scale: self
                .code_font_scale
                .clamp(CODE_FONT_SCALE_RANGE.0, CODE_FONT_SCALE_RANGE.1),
            line_height: self
                .line_height
                .clamp(LINE_HEIGHT_RANGE.0, LINE_HEIGHT_RANGE.1),
            light_colors: sanitize_colors(&self.light_colors),
            dark_colors: sanitize_colors(&self.dark_colors),
        }
    }
}

/// Keymap overrides: command id to the keys that replace its default
/// shortcuts (`CodeMirror` key names such as `Mod-Shift-x`). An empty list
/// unbinds the command; commands not listed keep their defaults.
pub type KeymapOverrides = BTreeMap<String, Vec<String>>;

/// Keeps well-formed entries only: a command id like `format.strong` and key
/// names without whitespace.
#[must_use]
pub fn sanitize_keymap(keymap: &KeymapOverrides) -> KeymapOverrides {
    let id_ok = |id: &str| {
        id.contains('.')
            && id.len() <= 80
            && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.')
    };
    keymap
        .iter()
        .filter(|(id, _)| id_ok(id))
        .map(|(id, keys)| {
            let keys = keys
                .iter()
                .filter(|k| !k.is_empty() && k.len() <= 40 && !k.chars().any(char::is_whitespace))
                .cloned()
                .collect();
            (id.clone(), keys)
        })
        .collect()
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
    /// Update preferences. Added without a schema bump: older files simply
    /// lack the key and get the defaults.
    pub updates: UpdateSettings,
    /// Line wrap preferences (added without a schema bump, like `updates`).
    pub wrap: WrapSettings,
    /// Editor text size in CSS pixels (View > Zoom; added without a schema
    /// bump). The frontend scales the whole document from it.
    pub font_size: u32,
    /// Fonts, sizes and colors (added without a schema bump, like `updates`).
    pub appearance: AppearanceSettings,
    /// Keymap overrides by command id (added without a schema bump).
    pub keymap: KeymapOverrides,
    /// Native webview spell-check in the editor (added without a schema bump).
    pub spellcheck: bool,
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
            updates: UpdateSettings::default(),
            wrap: WrapSettings::default(),
            font_size: DEFAULT_FONT_SIZE,
            appearance: AppearanceSettings::default(),
            keymap: KeymapOverrides::new(),
            spellcheck: true,
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

/// Keeps an editor text size inside [`MIN_FONT_SIZE`, `MAX_FONT_SIZE`].
#[must_use]
pub fn clamp_font_size(size: u32) -> u32 {
    size.clamp(MIN_FONT_SIZE, MAX_FONT_SIZE)
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
    // A hand-edited size outside the range would make the text unusable.
    settings.font_size = clamp_font_size(settings.font_size);
    settings
}

/// Parses settings JSON and migrates it to the current schema.
///
/// Missing fields take their defaults and unknown keys are preserved.
pub fn parse(json: &str) -> Result<Settings, AppError> {
    // Editors such as Windows PowerShell 5.1 write UTF-8 with a BOM.
    let json = json.strip_prefix('\u{feff}').unwrap_or(json);
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

/// Loads settings for startup. An unreadable file is renamed to
/// `settings.invalid.json` next to it (replacing an older one) before the
/// defaults are used, so the next save cannot overwrite the user's data.
pub fn load_or_recover(path: &Path) -> Settings {
    match load(path) {
        Ok(settings) => settings,
        Err(e) => {
            let backup = path.with_file_name("settings.invalid.json");
            match fs::rename(path, &backup) {
                Ok(()) => eprintln!("{e}; kept as {}, using defaults", backup.display()),
                Err(re) => eprintln!("{e}; backup failed ({re}), using defaults"),
            }
            Settings::default()
        }
    }
}

/// Applies `mutate` to the settings currently on disk at `path`, or to
/// `fallback` (this process's copy) when the file is missing or unreadable.
/// Every GCMD window is its own process with its own copy, so starting from
/// the file keeps what other windows saved since this one started.
pub fn merge_change(
    path: &Path,
    fallback: &Settings,
    mutate: impl FnOnce(&mut Settings),
) -> Settings {
    let mut current = match load(path) {
        Ok(on_disk) if path.exists() => on_disk,
        _ => fallback.clone(),
    };
    mutate(&mut current);
    current
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
        assert_eq!(
            value["updates"],
            serde_json::json!({"check": "auto", "lastCheckMs": null, "skippedVersion": null})
        );
        assert_eq!(
            value["wrap"],
            serde_json::json!({"mode": "full", "width": 832, "margin": 40})
        );
        assert_eq!(value["fontSize"], 16);
    }

    #[test]
    fn parse_reads_font_size_and_clamps_it() {
        assert_eq!(parse(r#"{"fontSize":20}"#).unwrap().font_size, 20);
        assert_eq!(parse("{}").unwrap().font_size, DEFAULT_FONT_SIZE);
        assert_eq!(parse(r#"{"fontSize":1}"#).unwrap().font_size, MIN_FONT_SIZE);
        assert_eq!(
            parse(r#"{"fontSize":500}"#).unwrap().font_size,
            MAX_FONT_SIZE
        );
    }

    #[test]
    fn parse_reads_wrap_settings_and_fills_missing_fields() {
        let s = parse(r#"{"wrap":{"mode":"fixed","width":1200}}"#).unwrap();
        assert_eq!(s.wrap.mode, WrapMode::Fixed);
        assert_eq!(s.wrap.width, 1200);
        assert_eq!(s.wrap.margin, WrapSettings::default().margin);
        assert_eq!(parse("{}").unwrap().wrap, WrapSettings::default());
    }

    #[test]
    fn parse_v1_file_without_updates_gets_defaults() {
        let s = parse(r#"{"schemaVersion":1,"theme":"dark","recentFiles":["/a.md"]}"#).unwrap();
        assert_eq!(s.updates, UpdateSettings::default());
        assert_eq!(s.recent_files, ["/a.md"]);
    }

    #[test]
    fn parse_reads_update_settings() {
        let json = r#"{"updates":{"check":"manual","lastCheckMs":5,"skippedVersion":"0.3.0"}}"#;
        let s = parse(json).unwrap();
        assert_eq!(s.updates.check, UpdateCheck::Manual);
        assert_eq!(s.updates.last_check_ms, Some(5));
        assert_eq!(s.updates.skipped_version.as_deref(), Some("0.3.0"));
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
    fn parse_accepts_a_byte_order_mark() {
        let s = parse("\u{feff}{\"theme\":\"dark\"}").unwrap();
        assert_eq!(s.theme, Theme::Dark);
    }

    #[test]
    fn load_or_recover_sets_an_unreadable_file_aside() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{broken").unwrap();
        assert_eq!(load_or_recover(&path), Settings::default());
        assert!(!path.exists());
        let backup = dir.path().join("settings.invalid.json");
        assert_eq!(fs::read_to_string(backup).unwrap(), "{broken");
    }

    #[test]
    fn load_or_recover_reads_a_valid_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{"theme":"light"}"#).unwrap();
        assert_eq!(load_or_recover(&path).theme, Theme::Light);
        assert!(path.exists());
    }

    #[test]
    fn load_invalid_file_is_settings_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "not json").unwrap();
        assert!(matches!(load(&path), Err(AppError::Settings(_))));
    }

    #[test]
    fn merge_change_starts_from_the_file_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        // This process started with the defaults; another window then saved
        // a dark theme.
        let ours = Settings::default();
        let theirs = Settings {
            theme: Theme::Dark,
            ..Settings::default()
        };
        save(&path, &theirs).unwrap();
        let merged = merge_change(&path, &ours, |s| s.sidebar_visible = true);
        assert_eq!(merged.theme, Theme::Dark);
        assert!(merged.sidebar_visible);
    }

    #[test]
    fn merge_change_falls_back_without_a_readable_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let ours = Settings {
            theme: Theme::Light,
            ..Settings::default()
        };
        assert_eq!(merge_change(&path, &ours, |_| {}).theme, Theme::Light);
        fs::write(&path, "not json").unwrap();
        assert_eq!(merge_change(&path, &ours, |_| {}).theme, Theme::Light);
    }

    #[test]
    fn phase_7_fields_default_when_missing() {
        let s = parse(r#"{"schemaVersion":1}"#).unwrap();
        assert_eq!(s.appearance, AppearanceSettings::default());
        assert!(s.keymap.is_empty());
        assert!(s.spellcheck);
        let value = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(value["appearance"]["codeFontScale"], 90);
        assert_eq!(value["appearance"]["lightColors"], serde_json::json!({}));
        assert_eq!(value["keymap"], serde_json::json!({}));
        assert_eq!(value["spellcheck"], true);
    }

    #[test]
    fn parse_reads_appearance_keymap_and_spellcheck() {
        let json = r##"{"appearance":{"textFont":"Georgia","lineHeight":180,"darkColors":{"bg":"#000000"}},
            "keymap":{"format.strong":["Mod-Shift-b"],"line.delete":[]},"spellcheck":false}"##;
        let s = parse(json).unwrap();
        assert_eq!(s.appearance.text_font, "Georgia");
        assert_eq!(s.appearance.line_height, 180);
        assert_eq!(s.appearance.code_font_scale, 90);
        assert_eq!(s.appearance.dark_colors["bg"], "#000000");
        assert_eq!(s.keymap["format.strong"], ["Mod-Shift-b"]);
        assert_eq!(s.keymap["line.delete"], Vec::<String>::new());
        assert!(!s.spellcheck);
    }

    #[test]
    fn appearance_sanitized_clamps_and_filters() {
        let mut a = AppearanceSettings {
            text_font: "Evil; } body { color: red".into(),
            code_font_scale: 1,
            line_height: 120,
            ..AppearanceSettings::default()
        };
        a.light_colors.insert("bg".into(), "#ABCDEF".into());
        a.light_colors.insert("fg".into(), "red".into());
        a.light_colors.insert("Bad Key".into(), "#000000".into());
        let s = a.sanitized();
        assert_eq!(s.text_font, "Evil  body  color: red");
        assert_eq!(s.code_font_scale, CODE_FONT_SCALE_RANGE.0);
        assert_eq!(s.line_height, 120);
        assert_eq!(s.light_colors.len(), 1);
        assert_eq!(s.light_colors["bg"], "#abcdef");
    }

    #[test]
    fn sanitize_keymap_drops_malformed_entries() {
        let mut k = KeymapOverrides::new();
        k.insert(
            "format.strong".into(),
            vec!["Mod-b".into(), "has space".into(), String::new()],
        );
        k.insert("nodot".into(), vec!["Mod-x".into()]);
        k.insert("line.delete".into(), vec![]);
        let s = sanitize_keymap(&k);
        assert_eq!(s.len(), 2);
        assert_eq!(s["format.strong"], ["Mod-b"]);
        assert_eq!(s["line.delete"], Vec::<String>::new());
    }
}
