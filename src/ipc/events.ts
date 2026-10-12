/**
 * Events emitted by the Rust side.
 *
 * - `menu`: payload is a command id (see `menu.rs`), or `recent:<path>`.
 * - `open-file`: payload is a path (macOS open events after launch).
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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
