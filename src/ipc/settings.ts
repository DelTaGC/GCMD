/**
 * Typed wrappers for the Rust `settings` commands. Settings are versioned
 * JSON in the OS app-config directory (CLAUDE.md invariant 7).
 */
import { invoke } from "@tauri-apps/api/core";

export type ThemePreference = "light" | "dark" | "system";

export interface UpdateSettings {
  check: "auto" | "manual";
  /** Last completed check, Unix milliseconds. */
  lastCheckMs: number | null;
  skippedVersion: string | null;
}

export type WrapMode = "off" | "full" | "fixed";

/** Line wrap preferences; sizes in CSS pixels (`settings.rs` `WrapSettings`). */
export interface WrapSettings {
  mode: WrapMode;
  /** Text width in fixed mode. */
  width: number;
  /** Margin on each side in full and off modes. */
  margin: number;
}

/**
 * Fonts, code size, line height and colors (`settings.rs`
 * `AppearanceSettings`). The text size is `Settings.fontSize` (View > Zoom).
 */
export interface AppearanceSettings {
  /** CSS font-family list for the text; empty for the default. */
  textFont: string;
  /** CSS font-family list for code; empty for the default. */
  codeFont: string;
  /** Code size in percent of the text size. */
  codeFontScale: number;
  /** Line height in percent of the font size. */
  lineHeight: number;
  /** Color overrides by CSS variable name without dashes, `#rrggbb`. */
  lightColors: Record<string, string>;
  darkColors: Record<string, string>;
}

/** Keymap overrides: command id -> keys replacing its defaults ([] unbinds). */
export type KeymapOverrides = Readonly<Record<string, readonly string[]>>;

export interface Settings {
  schemaVersion: number;
  theme: ThemePreference;
  recentFiles: string[];
  sidebarVisible: boolean;
  updates: UpdateSettings;
  wrap: WrapSettings;
  /** Editor text size in CSS pixels (View > Zoom). */
  fontSize: number;
  appearance: AppearanceSettings;
  keymap: KeymapOverrides;
  spellcheck: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  textFont: "",
  codeFont: "",
  codeFontScale: 90,
  lineHeight: 160,
  lightColors: {},
  darkColors: {},
};

export function setAppearance(appearance: AppearanceSettings): Promise<Settings> {
  return invoke<Settings>("set_appearance", { appearance });
}

export function setKeymap(keymap: KeymapOverrides): Promise<Settings> {
  return invoke<Settings>("set_keymap", { keymap });
}

export function setSpellcheck(enabled: boolean): Promise<Settings> {
  return invoke<Settings>("set_spellcheck", { enabled });
}

export function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export function setTheme(theme: ThemePreference): Promise<Settings> {
  return invoke<Settings>("set_theme", { theme });
}

export function setSidebarVisible(visible: boolean): Promise<Settings> {
  return invoke<Settings>("set_sidebar_visible", { visible });
}

export function setWrap(wrap: WrapSettings): Promise<Settings> {
  return invoke<Settings>("set_wrap", { wrap });
}

export function setFontSize(size: number): Promise<Settings> {
  return invoke<Settings>("set_font_size", { size });
}

export function addRecentFile(path: string): Promise<Settings> {
  return invoke<Settings>("add_recent_file", { path });
}

export function removeRecentFile(path: string): Promise<Settings> {
  return invoke<Settings>("remove_recent_file", { path });
}

export function clearRecentFiles(): Promise<Settings> {
  return invoke<Settings>("clear_recent_files");
}
