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

export interface Settings {
  schemaVersion: number;
  theme: ThemePreference;
  recentFiles: string[];
  sidebarVisible: boolean;
  updates: UpdateSettings;
  wrap: WrapSettings;
  /** Editor text size in CSS pixels (View > Zoom). */
  fontSize: number;
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
