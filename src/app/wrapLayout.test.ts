import { describe, expect, it } from "vitest";
import type { WrapSettings } from "../ipc/settings";
import { MIN_MARGIN, MIN_TEXT, dragTo, nextWrapMode, wrapLayout } from "./wrapLayout";

const FULL: WrapSettings = { mode: "full", width: 832, margin: 40 };
const FIXED: WrapSettings = { mode: "fixed", width: 832, margin: 40 };

describe("wrapLayout", () => {
  it("full width keeps the margins and gives the rest to the text", () => {
    expect(wrapLayout(FULL, 2400)).toEqual({ margin: 40, text: 2320 });
  });

  it("fixed width centers the text column", () => {
    expect(wrapLayout(FIXED, 2400)).toEqual({ margin: 784, text: 832 });
  });

  it("fixed width shrinks to the window, keeping the minimum margins", () => {
    expect(wrapLayout(FIXED, 600)).toEqual({ margin: MIN_MARGIN, text: 600 - 2 * MIN_MARGIN });
  });

  it("full width margins give way in a narrow window", () => {
    const layout = wrapLayout({ ...FULL, margin: 500 }, 600);
    expect(layout.text).toBe(MIN_TEXT);
    expect(layout.margin).toBe((600 - MIN_TEXT) / 2);
  });

  it("never returns negative sizes", () => {
    for (const settings of [FULL, FIXED]) {
      const layout = wrapLayout(settings, 10);
      expect(layout.margin).toBeGreaterThanOrEqual(0);
      expect(layout.text).toBeGreaterThanOrEqual(0);
    }
  });

  it("off uses the margin like full width", () => {
    expect(wrapLayout({ ...FULL, mode: "off" }, 1000)).toEqual({ margin: 40, text: 920 });
  });
});

describe("zoom scale", () => {
  it("grows the fixed width with the text size, still within the window", () => {
    expect(wrapLayout(FIXED, 2400, 1.5)).toEqual({ margin: 576, text: 1248 });
    expect(wrapLayout(FIXED, 1000, 1.5).text).toBe(1000 - 2 * MIN_MARGIN);
  });

  it("leaves full width margins alone", () => {
    expect(wrapLayout(FULL, 2400, 2)).toEqual(wrapLayout(FULL, 2400));
  });

  it("stores a dragged fixed width at the default size", () => {
    expect(dragTo(FIXED, 2400, 576, 1.5).width).toBe(832);
  });
});

describe("dragTo", () => {
  it("changes the margin in full width", () => {
    expect(dragTo(FULL, 2000, 300)).toEqual({ ...FULL, margin: 300 });
  });

  it("changes the text width in fixed width", () => {
    expect(dragTo(FIXED, 2000, 300)).toEqual({ ...FIXED, width: 1400 });
  });

  it("clamps to the minimum margin and text width", () => {
    expect(dragTo(FULL, 2000, -50).margin).toBe(MIN_MARGIN);
    expect(dragTo(FIXED, 2000, 5000).width).toBe(MIN_TEXT);
  });

  it("does nothing with wrapping off", () => {
    const off: WrapSettings = { ...FULL, mode: "off" };
    expect(dragTo(off, 2000, 300)).toBe(off);
  });
});

describe("nextWrapMode", () => {
  it("cycles off, fixed, full", () => {
    expect(nextWrapMode("off")).toBe("fixed");
    expect(nextWrapMode("fixed")).toBe("full");
    expect(nextWrapMode("full")).toBe("off");
  });
});
