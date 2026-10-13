/**
 * Opening things outside the app through `@tauri-apps/plugin-opener`. The
 * `opener:default` permission allows `http(s)`, `mailto:` and `tel:` URLs
 * only; nothing here opens arbitrary files.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./env";

/** Opens a web or mail URL in the system's default application. */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  await openUrl(url);
}
