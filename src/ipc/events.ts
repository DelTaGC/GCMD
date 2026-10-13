/**
 * Events emitted by the Rust side.
 *
 * - `menu`: payload is a command id (see `menu.rs`), or `recent:<path>`.
 * - `open-file`: payload is a path (macOS open events after launch).
 * - `file-changed`: the watched document changed on disk (`watcher.rs`).
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface FileChange {
  /** The watched path, as given to `watchDocument`. */
  path: string;
  /** Current modification time in milliseconds; `null` when the file is gone. */
  mtimeMs: number | null;
}

export function onFileChanged(handler: (change: FileChange) => void): Promise<UnlistenFn> {
  return listen<FileChange>("file-changed", (event) => {
    handler(event.payload);
  });
}

export function onMenu(handler: (id: string) => void): Promise<UnlistenFn> {
  return listen<string>("menu", (event) => {
    handler(event.payload);
  });
}

export function onOpenFile(handler: (path: string) => void): Promise<UnlistenFn> {
  return listen<string>("open-file", (event) => {
    handler(event.payload);
  });
}
