/**
 * Typed wrappers for the Rust update commands (`updater.rs`, ADR 0010).
 * The updater plugin is driven from Rust; the frontend has no plugin
 * permissions.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Settings } from "./settings";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
}

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

/** Asks the update endpoint for a newer version; `null` when up to date. */
export function updateCheck(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>("update_check");
}

/**
 * Downloads and installs the update found by `updateCheck`, then restarts
 * the app (on Windows the process exits inside the call), so on success it
 * never settles; it rejects when the download, check or install fails.
 */
export async function updateInstall(): Promise<void> {
  await invoke("update_install");
}

/** Other GCMD processes an install would close (always 0 outside Windows). */
export function updateOtherInstances(): Promise<number> {
  return invoke<number>("update_other_instances");
}

export function updateSkip(version: string): Promise<Settings> {
  return invoke<Settings>("update_skip", { version });
}

export function setAutoUpdate(enabled: boolean): Promise<Settings> {
  return invoke<Settings>("set_auto_update", { enabled });
}

export function onUpdateProgress(handler: (progress: UpdateProgress) => void): Promise<UnlistenFn> {
  return listen<UpdateProgress>("update-progress", (event) => {
    handler(event.payload);
  });
}
