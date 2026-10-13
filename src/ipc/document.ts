/**
 * Typed wrappers for the Rust `document` commands. The buffer is LF
 * internally; the backend re-applies the file's line ending and BOM on save.
 */
import { invoke } from "@tauri-apps/api/core";

export type LineEnding = "lf" | "crlf";

export interface DocumentMeta {
  eol: LineEnding;
  bom: boolean;
  trailingNewline: boolean;
}

export interface DocumentFile {
  path: string;
  text: string;
  meta: DocumentMeta;
  mtimeMs: number;
}

export const DEFAULT_META: DocumentMeta = { eol: "lf", bom: false, trailingNewline: true };

export function readDocument(path: string): Promise<DocumentFile> {
  return invoke<DocumentFile>("read_document", { path });
}

/** Writes `text` and returns the new modification time in milliseconds. */
export function writeDocument(path: string, text: string, meta: DocumentMeta): Promise<number> {
  return invoke<number>("write_document", { path, text, meta });
}

/**
 * Starts watching `path` for changes made by other programs; `file-changed`
 * events (`ipc/events.ts`) follow. Replaces any previous watch.
 */
export function watchDocument(path: string): Promise<void> {
  return invoke("watch_document", { path });
}

/** Stops watching the current document. */
export function unwatchDocument(): Promise<void> {
  return invoke("unwatch_document");
}
