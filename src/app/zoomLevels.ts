/**
 * Pure rules for View > Zoom: the editor text sizes the zoom steps through,
 * how a step moves from any size, and how wheel deltas become steps.
 * `app/zoom.ts` applies them. Limits mirror `settings.rs`.
 */

/** Default editor text size, in CSS pixels (`--editor-font-size`). */
export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;

/** Sizes a zoom step lands on. Whole pixels keep the text crisp. */
export const FONT_SIZES: readonly number[] = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 54, 60,
  66, 72,
];

/** A size within the limits, in whole pixels; garbage becomes the default. */
export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) {
    return DEFAULT_FONT_SIZE;
  }
  return Math.min(Math.max(Math.round(size), MIN_FONT_SIZE), MAX_FONT_SIZE);
}

/**
 * The size `steps` entries of `FONT_SIZES` away from `size` (positive is
 * larger). A size between two entries (hand-edited settings) counts the
 * nearer entry in the step direction as the first step.
 */
export function zoomStep(size: number, steps: number): number {
  const current = clampFontSize(size);
  if (steps === 0) {
    return current;
  }
  const last = FONT_SIZES.length - 1;
  let index: number;
  if (steps > 0) {
    const above = FONT_SIZES.findIndex((s) => s > current);
    index = (above === -1 ? last + 1 : above) + steps - 1;
  } else {
    const below = FONT_SIZES.reduce((found, s, i) => (s < current ? i : found), -1);
    index = below + steps + 1;
  }
  return FONT_SIZES[Math.min(Math.max(index, 0), last)] ?? current;
}

/** Zoom as a percentage of the default size, for display. */
export function zoomPercent(size: number): number {
  return Math.round((size / DEFAULT_FONT_SIZE) * 100);
}

/** Pixels of wheel travel per zoom step (one mouse wheel notch). */
const PIXELS_PER_STEP = 100;
/** Lines of wheel travel per zoom step (`WheelEvent.DOM_DELTA_LINE`). */
const LINES_PER_STEP = 3;

/**
 * Adds a wheel event's travel to `pending` (in steps, positive is zoom in)
 * and returns the whole steps to take now plus what is left over. Touchpads
 * send many small deltas; they add up to a step like a wheel notch does.
 * Turning the other way drops what was left over.
 */
export function wheelSteps(
  pending: number,
  deltaY: number,
  deltaMode: number,
): { steps: number; pending: number } {
  const perStep = deltaMode === 0 ? PIXELS_PER_STEP : deltaMode === 1 ? LINES_PER_STEP : 1;
  const travel = -deltaY / perStep;
  const total = Math.sign(travel) === -Math.sign(pending) ? travel : pending + travel;
  // `+ 0` turns the -0 of a small negative travel into 0.
  const steps = Math.trunc(total) + 0;
  return { steps, pending: total - steps };
}
