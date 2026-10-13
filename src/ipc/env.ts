/**
 * Whether the page runs inside the Tauri webview. False under plain
 * `npm run dev` in a browser, where IPC is unavailable; the editor still
 * works there for UI debugging.
 */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/**
 * Whether the page runs on macOS, where the command key is Cmd, the menu
 * bar belongs to the system and Alt+letter types special characters.
 */
export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
}
