/**
 * Typed wrappers for application-level Rust commands.
 */
import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
  /** SPDX expression of GCMD's own license. */
  license: string;
  /** Path of the bundled THIRD-PARTY-NOTICES.md, or null when it is missing. */
  notices: string | null;
}

export function appInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

/** The file passed on the command line or by a macOS open event, if any. */
export function launchArgs(): Promise<string | null> {
  return invoke<string | null>("launch_args");
}

/** Spawns a second GCMD process (CLAUDE.md invariant 6: one window, one file). */
export async function openNewWindow(path?: string): Promise<void> {
  await invoke("open_new_window", { path: path ?? null });
}

/** Pops up a top-level native menu (`menu.file`, `menu.edit`, ...). */
export function openMenu(id: string): Promise<boolean> {
  return invoke<boolean>("open_menu", { id });
}

/** Normalized form of a path for titles and the recent list. */
export function displayPath(path: string): Promise<string> {
  return invoke<string>("display_path", { path });
}
