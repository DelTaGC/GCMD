/**
 * GCMD frontend bootstrap.
 *
 * Phase 1 only proves that the window opens and the Rust side answers.
 * Phase 2 replaces the placeholder with the CodeMirror editor (see PLAN.md).
 */
import { invoke } from "@tauri-apps/api/core";

interface AppInfo {
  name: string;
  version: string;
}

async function bootstrap(): Promise<void> {
  const host = document.getElementById("editor");
  if (!host) {
    throw new Error("missing #editor host element");
  }
  const info = await invoke<AppInfo>("app_info");
  host.textContent = `${info.name} ${info.version} - editor arrives in phase 2`;
}

bootstrap().catch((err: unknown) => {
  console.error("bootstrap failed", err);
});
