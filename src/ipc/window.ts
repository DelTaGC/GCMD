/**
 * Window-level wrappers: title, close handling, file drag-and-drop.
 */
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./env";

export function setTitle(title: string): Promise<void> {
  if (!isTauri()) {
    return Promise.resolve();
  }
  return getCurrentWindow().setTitle(title);
}

/**
 * Intercepts the window close request (X button, Alt+F4, File > Exit).
 * The handler decides: resolve `true` to let the window close, `false` to
 * keep it open. While a handler is registered the window never closes on
 * its own.
 */
export async function onCloseRequested(handler: () => Promise<boolean>): Promise<() => void> {
  const window = getCurrentWindow();
  return window.onCloseRequested(async (event) => {
    event.preventDefault();
    if (await handler()) {
      await window.destroy();
    }
  });
}

/** Asks the window to close; goes through `onCloseRequested`. */
export function requestClose(): Promise<void> {
  return getCurrentWindow().close();
}

/** Files dropped on the window, as absolute paths. */
export async function onFilesDropped(handler: (paths: string[]) => void): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") {
      handler(event.payload.paths);
    }
  });
}
