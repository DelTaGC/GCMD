import { describe, expect, it } from "vitest";
import { kinds, stateWith } from "../testing";
import { computeFamily } from "./decorate";
import { prefixWidth, visitListIndent, type MeasureText } from "./listIndent";

/** One unit per character; bold counts double, mono bold triple. */
const measure: MeasureText = (text, style) =>
  text.length * (style === "text" ? 1 : style === "mark" ? 2 : 3);

const width = (prefix: string, active = false): { em: number; px: number } =>
  prefixWidth(prefix, active, "•", measure);

const run = (doc: string, cursor = doc.length): string[] => {
  const state = stateWith(doc, cursor);
  return kinds(computeFamily(state, [{ from: 0, to: doc.length }], visitListIndent));
};

describe("prefixWidth", () => {
  it("measures the marker as displayed", () => {
    expect(width("- ")).toEqual({ em: 2, px: 0 });
    expect(width("- ", true)).toEqual({ em: 3, px: 0 });
    expect(width("  12. ")).toEqual({ em: 6, px: 0 });
  });

  it("counts a checkbox in place of the marker and the box", () => {
    expect(width("- [x] ")).toEqual({ em: 0, px: 19 });
    expect(width("  - [ ] ")).toEqual({ em: 2, px: 19 });
    expect(width("- [ ] ", true)).toEqual({ em: 2 + 1 + 9 + 1, px: 0 });
  });

  it("drops hidden quote markers and their space", () => {
    expect(width("> > - ")).toEqual({ em: 2, px: 0 });
    expect(width("> - ", true)).toEqual({ em: 2 + 1 + 2 + 1, px: 0 });
  });

  it("advances a tab to the next stop", () => {
    expect(width("\t- ")).toEqual({ em: 6, px: 0 });
    expect(width(" \t- ")).toEqual({ em: 6, px: 0 });
  });
});

describe("visitListIndent", () => {
  it("hangs the first line and boxes its prefix", () => {
    expect(run("- one\n\ntext")).toEqual(["line:cm-list-hang@0-0", "mark:cm-list-prefix@0-2"]);
  });

  it("indents continuation lines, with and without leading spaces", () => {
    expect(run("1. one\n   two\nlazy\n\ntext")).toEqual([
      "line:cm-list-hang@0-0",
      "mark:cm-list-prefix@0-3",
      "line:cm-list-hang@7-7",
      "mark:cm-list-prefix@7-10",
      "line:cm-list-lazy@14-14",
    ]);
  });

  it("handles a second paragraph and nested items", () => {
    expect(run("- a\n\n  b\n  - c\n\ntext")).toEqual([
      "line:cm-list-hang@0-0",
      "mark:cm-list-prefix@0-2",
      "line:cm-list-hang@5-5",
      "mark:cm-list-prefix@5-7",
      "line:cm-list-hang@9-9",
      "mark:cm-list-prefix@9-13",
    ]);
  });

  it("covers the task box and quote markers", () => {
    expect(run("- [ ] a\n\ntext")).toContain("mark:cm-list-prefix@0-6");
    expect(run("> - a\n> b\n\ntext")).toEqual([
      "line:cm-list-hang@0-0",
      "mark:cm-list-prefix@0-4",
      "line:cm-list-hang@6-6",
      "mark:cm-list-prefix@6-8",
    ]);
  });

  it("leaves paragraphs, code and empty items alone", () => {
    expect(run("plain\n\n- \n\n- ```\n  code\n  ```\n")).toEqual([]);
  });
});
