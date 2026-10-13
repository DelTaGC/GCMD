/**
 * Keyboard access to the native menu bar. WebView2 keeps Alt+letter inside
 * the webview, so the native mnemonics (Alt+F, Alt+E, Alt+V, Alt+H) never
 * reach the menu. This listener catches them and asks the Rust side to pop
 * the matching menu up under its title; from there the native menu handles
 * arrows, letters and Escape itself.
 *
 * Not installed on macOS: the menu bar is the system's (no mnemonics) and
 * Option+letter types special characters there.
 */
import { openMenu } from "../ipc/app";
import { isMac } from "../ipc/env";

const MNEMONICS: Readonly<Record<string, string>> = {
  f: "menu.file",
  e: "menu.edit",
  v: "menu.view",
  h: "menu.help",
};

export function installMenuMnemonics(target: Window = window): () => void {
  if (isMac()) {
    return () => {
      // Nothing was installed.
    };
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const id = MNEMONICS[event.key.toLowerCase()];
    if (id === undefined) {
      return;
    }
    event.preventDefault();
    openMenu(id).catch((err: unknown) => {
      console.warn("openMenu failed", err);
    });
  };
  target.addEventListener("keydown", onKeyDown, true);
  return () => {
    target.removeEventListener("keydown", onKeyDown, true);
  };
}
