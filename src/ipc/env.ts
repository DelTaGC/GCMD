/**
 * Whether the page runs inside the Tauri webview. False under plain
 * `npm run dev` in a browser, where IPC is unavailable; the editor still
 * works there for UI debugging.
 */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
