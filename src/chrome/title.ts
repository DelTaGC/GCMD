/**
 * Window title: `name* - GCMD`. The asterisk is the dirty marker.
 */
import { setTitle } from "../ipc/window";

export const UNTITLED = "Untitled";

export function fileName(path: string | null): string {
  if (path === null) {
    return UNTITLED;
  }
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}

export function formatTitle(path: string | null, dirty: boolean): string {
  return `${fileName(path)}${dirty ? "*" : ""} - GCMD`;
}

export function updateTitle(path: string | null, dirty: boolean): void {
  const title = formatTitle(path, dirty);
  document.title = title;
  setTitle(title).catch((err: unknown) => {
    console.warn("setTitle failed", err);
  });
}
