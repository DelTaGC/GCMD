/**
 * Typed wrappers for the Rust `paths` commands: resolving markdown link
 * destinations against the open document's directory.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** Absolute path of `href` resolved against the document at `base`; rejects when the file does not exist. */
export function resolvePath(base: string | null, href: string): Promise<string> {
  return invoke<string>("resolve_path", { base, href });
}

/** One entry of a directory listing. */
export interface DirEntry {
  readonly name: string;
  readonly isDir: boolean;
}

/**
 * Entries of `dir`, the directory part of a link destination being typed
 * (`""`, `docs/`, `../img/`), resolved against the document at `base`.
 * Directories first; rejects when the directory cannot be read.
 */
export function listDir(base: string | null, dir: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_dir", { base, dir });
}

/** Like resolvePath, and also allows the file in the asset scope; returns a URL usable as an <img> src. */
export async function resolveAssetUrl(base: string | null, href: string): Promise<string> {
  const path = await invoke<string>("resolve_asset", { base, href });
  return convertFileSrc(path);
}
