/**
 * Native dialogs through `@tauri-apps/plugin-dialog`. Permissions live in
 * `src-tauri/capabilities/default.json`.
 */
import { message, open, save } from "@tauri-apps/plugin-dialog";

const MARKDOWN_FILTER = [
  { name: "Markdown", extensions: ["md", "markdown"] },
  { name: "All files", extensions: ["*"] },
];

/** Open-file picker; `null` when cancelled. */
export async function pickOpenFile(): Promise<string | null> {
  const result = await open({ multiple: false, directory: false, filters: MARKDOWN_FILTER });
  return typeof result === "string" ? result : null;
}

/** Save-as picker; `null` when cancelled. */
export function pickSaveFile(defaultPath?: string): Promise<string | null> {
  return save({ filters: MARKDOWN_FILTER, ...(defaultPath ? { defaultPath } : {}) });
}

export type UnsavedChoice = "save" | "discard" | "cancel";

/** Three-way prompt shown before discarding unsaved changes. */
export async function askUnsavedChanges(name: string): Promise<UnsavedChoice> {
  const result = await message(`Do you want to save the changes to "${name}"?`, {
    title: "Unsaved changes",
    kind: "warning",
    buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
  });
  switch (result) {
    case "Yes":
    case "Save":
      return "save";
    case "No":
    case "Don't Save":
      return "discard";
    default:
      return "cancel";
  }
}

export async function showError(title: string, text: string): Promise<void> {
  await message(text, { title, kind: "error" });
}

export async function showInfo(title: string, text: string): Promise<void> {
  await message(text, { title, kind: "info" });
}
