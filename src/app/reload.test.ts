import { describe, expect, it } from "vitest";
import { minimalChange } from "./reload";

function applied(before: string, after: string): string {
  const change = minimalChange(before, after);
  if (change === null) {
    return before;
  }
  return before.slice(0, change.from) + change.insert + before.slice(change.to);
}

describe("minimalChange", () => {
  it("is null for equal texts", () => {
    expect(minimalChange("abc", "abc")).toBeNull();
    expect(minimalChange("", "")).toBeNull();
  });

  it("keeps the common prefix and suffix", () => {
    expect(minimalChange("one two three", "one 2 three")).toEqual({
      from: 4,
      to: 7,
      insert: "2",
    });
    expect(minimalChange("# A\n\nold\n", "# A\n\nnew\n")).toEqual({
      from: 5,
      to: 8,
      insert: "new",
    });
  });

  it("handles pure insertions, deletions and replacements of everything", () => {
    expect(minimalChange("ab", "axb")).toEqual({ from: 1, to: 1, insert: "x" });
    expect(minimalChange("axb", "ab")).toEqual({ from: 1, to: 2, insert: "" });
    expect(minimalChange("abc", "")).toEqual({ from: 0, to: 3, insert: "" });
    expect(minimalChange("", "abc")).toEqual({ from: 0, to: 0, insert: "abc" });
    expect(minimalChange("abc", "xyz")).toEqual({ from: 0, to: 3, insert: "xyz" });
  });

  it("does not let prefix and suffix overlap on repeated text", () => {
    for (const [before, after] of [
      ["aaa", "aa"],
      ["aa", "aaa"],
      ["abab", "ab"],
      ["x\n\n", "x\n"],
    ]) {
      expect(applied(before ?? "", after ?? "")).toBe(after);
    }
  });

  it("never splits a surrogate pair", () => {
    const before = "a\u{1F600}b";
    const after = "a\u{1F601}b";
    const change = minimalChange(before, after);
    expect(change).toEqual({ from: 1, to: 3, insert: "\u{1F601}" });
    expect(applied(before, after)).toBe(after);
  });
});
