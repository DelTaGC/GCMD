import { describe, expect, it } from "vitest";
import { stateWith } from "../testing";
import { isActive, lineSpan, selectionTouches } from "./activeBlock";

const doc = "first line\nsecond **bold** line\nthird line";
// Offsets: "first line" = 0..10, "\n" at 10, second line 11..31, third 32..42.

describe("lineSpan", () => {
  it("widens an inline range to its line", () => {
    const state = stateWith(doc);
    expect(lineSpan(state, 18, 26)).toEqual({ from: 11, to: 31 });
  });

  it("covers every line of a multi-line range", () => {
    const state = stateWith(doc);
    expect(lineSpan(state, 5, 35)).toEqual({ from: 0, to: 42 });
  });
});

describe("selectionTouches", () => {
  it("is inclusive at both ends", () => {
    expect(selectionTouches(stateWith(doc, 11), 11, 31)).toBe(true);
    expect(selectionTouches(stateWith(doc, 31), 11, 31)).toBe(true);
  });

  it("is false just outside the range", () => {
    expect(selectionTouches(stateWith(doc, 10), 11, 31)).toBe(false);
    expect(selectionTouches(stateWith(doc, 32), 11, 31)).toBe(false);
  });

  it("is true when a selection range spans the block", () => {
    expect(selectionTouches(stateWith(doc, { anchor: 2, head: 40 }), 11, 31)).toBe(true);
  });
});

describe("isActive", () => {
  it("activates an inline node when the cursor is anywhere on its line", () => {
    expect(isActive(stateWith(doc, 11), 18, 26)).toBe(true);
    expect(isActive(stateWith(doc, 31), 18, 26)).toBe(true);
  });

  it("does not activate an inline node from a neighbouring line", () => {
    expect(isActive(stateWith(doc, 3), 18, 26)).toBe(false);
    expect(isActive(stateWith(doc, 40), 18, 26)).toBe(false);
  });

  it("treats a block range as a whole", () => {
    const fence = "para\n```ts\nlet a = 1;\n```\nafter";
    // Fence spans 5..25.
    expect(isActive(stateWith(fence, 12), 5, 25)).toBe(true);
    expect(isActive(stateWith(fence, 25), 5, 25)).toBe(true);
    expect(isActive(stateWith(fence, 26), 5, 25)).toBe(false);
    expect(isActive(stateWith(fence, 4), 5, 25)).toBe(false);
  });
});
