/**
 * Pure rules for the line wrap layout: where the text column sits for a
 * given mode and editor width, what a drag on the wrap bar changes, and the
 * double-click mode cycle. `app/wrap.ts` applies them.
 */
import type { WrapMode, WrapSettings } from "../ipc/settings";

/** Smallest margin on each side of the text, in pixels. */
export const MIN_MARGIN = 16;
/** Narrowest text column a drag can make, in pixels. */
export const MIN_TEXT = 240;

export interface WrapLayout {
  /** Margin on each side of the text column. */
  margin: number;
  /** Width of the text column. */
  text: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Largest margin that still leaves `MIN_TEXT` in `available` pixels. */
function maxMargin(available: number): number {
  return Math.floor((available - MIN_TEXT) / 2);
}

/** The text column for `settings` in an editor `available` pixels wide. */
export function wrapLayout(settings: WrapSettings, available: number): WrapLayout {
  const width = Math.max(0, Math.floor(available));
  if (settings.mode === "fixed") {
    const room = Math.max(0, width - 2 * MIN_MARGIN);
    const text = Math.min(Math.max(settings.width, MIN_TEXT), room);
    return { margin: Math.floor((width - text) / 2), text };
  }
  const margin = Math.min(clamp(settings.margin, MIN_MARGIN, maxMargin(width)), width / 2);
  return { margin, text: Math.max(0, width - 2 * margin) };
}

/**
 * Settings after dragging the bar so each margin is `margin` pixels: full
 * width keeps the margins, fixed width keeps the resulting text width.
 * Wrapping off has no column to drag.
 */
export function dragTo(settings: WrapSettings, available: number, margin: number): WrapSettings {
  const width = Math.floor(available);
  const kept = Math.round(clamp(margin, MIN_MARGIN, maxMargin(width)));
  switch (settings.mode) {
    case "full":
      return { ...settings, margin: kept };
    case "fixed":
      return { ...settings, width: Math.max(MIN_TEXT, width - 2 * kept) };
    case "off":
      return settings;
  }
}

/** Double-click order on the bar: off, fixed width, full width, off... */
export function nextWrapMode(mode: WrapMode): WrapMode {
  switch (mode) {
    case "off":
      return "fixed";
    case "fixed":
      return "full";
    case "full":
      return "off";
  }
}

export const WRAP_MODE_LABELS: Readonly<Record<WrapMode, string>> = {
  off: "Line wrap off",
  full: "Wrap at full width",
  fixed: "Wrap at fixed width",
};
