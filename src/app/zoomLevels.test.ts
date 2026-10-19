import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  clampFontSize,
  wheelSteps,
  zoomPercent,
  zoomStep,
} from "./zoomLevels";

describe("clampFontSize", () => {
  it("keeps sizes within the limits in whole pixels", () => {
    expect(clampFontSize(17.4)).toBe(17);
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(1000)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE);
  });
});

describe("zoomStep", () => {
  it("moves through the size list", () => {
    expect(zoomStep(16, 1)).toBe(17);
    expect(zoomStep(20, 1)).toBe(22);
    expect(zoomStep(16, -1)).toBe(15);
    expect(zoomStep(16, 3)).toBe(19);
    expect(zoomStep(16, 0)).toBe(16);
  });

  it("stops at the ends", () => {
    expect(zoomStep(MAX_FONT_SIZE, 1)).toBe(MAX_FONT_SIZE);
    expect(zoomStep(MIN_FONT_SIZE, -1)).toBe(MIN_FONT_SIZE);
    expect(zoomStep(16, 100)).toBe(MAX_FONT_SIZE);
    expect(zoomStep(16, -100)).toBe(MIN_FONT_SIZE);
  });

  it("steps from a size between two entries to the nearer one in that direction", () => {
    expect(zoomStep(21, 1)).toBe(22);
    expect(zoomStep(21, -1)).toBe(20);
    expect(zoomStep(21, 2)).toBe(24);
  });

  it("lists the default size and stays within the limits", () => {
    expect(FONT_SIZES).toContain(DEFAULT_FONT_SIZE);
    expect(FONT_SIZES[0]).toBe(MIN_FONT_SIZE);
    expect(FONT_SIZES.at(-1)).toBe(MAX_FONT_SIZE);
  });
});

describe("zoomPercent", () => {
  it("is relative to the default size", () => {
    expect(zoomPercent(16)).toBe(100);
    expect(zoomPercent(24)).toBe(150);
    expect(zoomPercent(17)).toBe(106);
  });
});

describe("wheelSteps", () => {
  it("turns one wheel notch into one step, up is zoom in", () => {
    expect(wheelSteps(0, -100, 0)).toEqual({ steps: 1, pending: 0 });
    expect(wheelSteps(0, 100, 0)).toEqual({ steps: -1, pending: 0 });
    expect(wheelSteps(0, -3, 1)).toEqual({ steps: 1, pending: 0 });
  });

  it("adds up small touchpad deltas", () => {
    let pending = 0;
    let steps = 0;
    for (let i = 0; i < 10; i += 1) {
      const result = wheelSteps(pending, -25, 0);
      pending = result.pending;
      steps += result.steps;
    }
    expect(steps).toBe(2);
    expect(pending).toBeCloseTo(0.5);
  });

  it("drops the leftover when the direction turns", () => {
    expect(wheelSteps(0.75, 25, 0)).toEqual({ steps: 0, pending: -0.25 });
  });
});
