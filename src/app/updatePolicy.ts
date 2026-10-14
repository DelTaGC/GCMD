/**
 * Pure rules for when to check for updates and what to tell the user
 * (ADR 0010). No IPC, no DOM.
 */
import type { UpdateProgress } from "../ipc/updates";
import type { UpdateSettings } from "../ipc/settings";

/** Automatic checks run at most this often (shared by all GCMD windows through settings). */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Delay after startup so the check never competes with opening the document. */
export const STARTUP_DELAY_MS = 5000;

/** Whether the background check after startup should run. */
export function shouldAutoCheck(updates: UpdateSettings, nowMs: number): boolean {
  if (updates.check !== "auto") {
    return false;
  }
  const last = updates.lastCheckMs;
  // A last check in the future means the clock moved back: check again.
  return last === null || nowMs - last >= CHECK_INTERVAL_MS || last > nowMs;
}

/** A skipped version stays quiet in automatic checks but not in manual ones. */
export function shouldAnnounce(version: string, updates: UpdateSettings, manual: boolean): boolean {
  return manual || updates.skippedVersion !== version;
}

/** Banner text while the update downloads. */
export function progressText(version: string, progress: UpdateProgress | null): string {
  const base = `Downloading GCMD ${version}`;
  if (!progress?.total || progress.total <= 0) {
    return `${base}...`;
  }
  const percent = Math.min(100, Math.floor((progress.downloaded * 100) / progress.total));
  return `${base}... ${String(percent)} %`;
}

/** Message shown when other GCMD windows would be closed by the installer. */
export function otherWindowsText(count: number): string {
  const [windows, them] =
    count === 1
      ? ["another GCMD window is", "it"]
      : [`${String(count)} other GCMD windows are`, "them"];
  return `The update cannot be installed while ${windows} open. Save and close ${them}, then try again.`;
}
