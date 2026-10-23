/**
 * Range computation for every live-preview family, on a plain EditorState.
 */
import type { TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { kinds, listDecorations, stateWith } from "../testing";
import { visitBlockquote } from "./blockquote";
import { infoLanguage, visitCodeFence } from "./codeFence";
import {
  collectBlocks,
  computeFamily,
  renderBlocks,
  type BlockVisitor,
  type FamilyOutput,
} from "./decorate";
import { visitHeadings } from "./headings";
import { visitHr } from "./hr";
import { visitInline } from "./inline";
import { toggleTaskMarkerAt, visitLists } from "./lists";
import { visitMermaidBlocks } from "./mermaid";
import { visitSpelling } from "./spelling";
import { visitTable, visitTableBlocks } from "./table";

type Visitor = Parameters<typeof computeFamily>[2];

function run(visit: Visitor, doc: string, cursor?: number): FamilyOutput {
  const state = stateWith(doc, cursor);
  return computeFamily(state, [{ from: 0, to: doc.length }], visit);
}

describe("headings", () => {
  it("hides the ATX marker and its space when inactive", () => {
    const out = run(visitHeadings, "## Title\n\ntext", 12);
    expect(kinds(out)).toEqual(["line:cm-heading cm-heading-2@0-0", "hide@0-3"]);
    expect(kinds({ decorations: out.atomic, atomic: out.atomic })).toEqual(["hide@0-3"]);
  });

  it("shows the marker in the markup color when the cursor is on the heading line", () => {
    const out = run(visitHeadings, "## Title\n\ntext", 5);
    expect(kinds(out)).toEqual(["line:cm-heading cm-heading-2@0-0", "mark:cm-mark@0-2"]);
  });

  it("hides a closing sequence with its leading spaces", () => {
    const out = run(visitHeadings, "# Title ##\n\ntext", 14);
    expect(kinds(out)).toEqual(["line:cm-heading cm-heading-1@0-0", "hide@0-2", "hide@7-10"]);
  });

  it("styles setext headings and mutes the underline", () => {
    const out = run(visitHeadings, "Title\n=====\n\ntext", 15);
    expect(kinds(out)).toEqual([
      "line:cm-heading cm-heading-1@0-0",
      "line:cm-setext-underline@6-6",
      "mark:cm-mark@6-11",
    ]);
  });
});

describe("inline", () => {
  it("hides emphasis and strong markers when inactive", () => {
    const doc = "a **b** *c*\n\nx";
    const out = run(visitInline, doc, 13);
    expect(kinds(out)).toEqual([
      "hide@2-4",
      "mark:cm-strong@2-7",
      "hide@5-7",
      "hide@8-9",
      "mark:cm-em@8-11",
      "hide@10-11",
    ]);
  });

  it("keeps markers visible, in the markup color, on the active line", () => {
    const out = run(visitInline, "a **b**", 0);
    expect(kinds(out)).toEqual(["mark:cm-mark@2-4", "mark:cm-strong@2-7", "mark:cm-mark@5-7"]);
  });

  it("hides inline code backticks, strikethrough tildes and escapes", () => {
    const doc = "`c` ~~s~~ \\*\n\nx";
    const out = run(visitInline, doc, 15);
    expect(kinds(out)).toEqual([
      "hide@0-1",
      "mark:cm-inline-code@0-3",
      "hide@2-3",
      "hide@4-6",
      "mark:cm-strike@4-9",
      "hide@7-9",
      "hide@10-11",
    ]);
  });

  it("shows only the link text when inactive and everything when active", () => {
    const doc = '[text](https://x.y "t")\n\nx';
    const inactive = run(visitInline, doc, 26);
    expect(kinds(inactive)).toEqual(["hide@0-1", "mark:cm-link@1-5", "hide@5-23"]);
    const active = run(visitInline, doc, 2);
    expect(kinds(active)).toEqual([
      "mark:cm-mark@0-1",
      "mark:cm-link@1-5",
      "mark:cm-mark@5-6",
      "mark:cm-mark@6-7",
      "mark:cm-url@7-18",
      "mark:cm-mark@22-23",
    ]);
  });

  it("styles bare autolinks and hides angle-bracket autolink marks", () => {
    const doc = "see https://a.b and <https://c.d>\n\nx";
    const out = run(visitInline, doc, 36);
    expect(kinds(out)).toEqual([
      "mark:cm-link@4-15",
      "hide@20-21",
      "mark:cm-link@21-32",
      "hide@32-33",
    ]);
  });

  it("styles a reference link like an inline one", () => {
    const doc = "[t][r]\n\n[r]: https://x.y";
    const out = run(visitInline, doc, 20);
    expect(kinds(out)).toEqual([
      "hide@0-1",
      "mark:cm-link@1-2",
      "hide@2-6",
      "mark:cm-link-reference@8-24",
    ]);
  });
});

describe("lists", () => {
  it("replaces bullets with a glyph when inactive and styles ordered marks", () => {
    const doc = "- a\n- b\n1. c\n\nx";
    const out = run(visitLists, doc, 14);
    expect(kinds(out)).toEqual([
      "widget:BulletWidget@0-1",
      "widget:BulletWidget@4-5",
      "mark:cm-list-mark@8-10",
    ]);
  });

  it("shows the raw bullet on the active line", () => {
    const out = run(visitLists, "- a\n- b", 1);
    expect(kinds(out)).toEqual(["mark:cm-mark@0-1", "widget:BulletWidget@4-5"]);
  });

  it("renders a checkbox in place of bullet and marker when inactive", () => {
    const doc = "- [ ] open\n- [x] done\n\nx";
    const out = run(visitLists, doc, 24);
    expect(kinds(out)).toEqual([
      "hide@0-2",
      "widget:CheckboxWidget@2-6",
      "hide@11-13",
      "widget:CheckboxWidget@13-17",
      "mark:cm-task-done@13-21",
    ]);
  });

  it("shows raw markers on the active task line", () => {
    const out = run(visitLists, "- [ ] open", 8);
    expect(kinds(out)).toEqual(["mark:cm-mark@0-1", "mark:cm-mark cm-task-marker@2-5"]);
  });

  it("toggles a task marker in the text", () => {
    const state = stateWith("- [ ] open");
    let text = "";
    const target = {
      state,
      dispatch: (tr: TransactionSpec) => {
        text = state.update(tr).state.doc.toString();
      },
    };
    expect(toggleTaskMarkerAt(target, 2)).toBe(true);
    expect(text).toBe("- [x] open");
    expect(toggleTaskMarkerAt(target, 0)).toBe(false);
  });
});

describe("blockquote", () => {
  it("adds one line class per quoted line and hides inactive marks with their space", () => {
    const doc = "> a\n> > b\n\nx";
    const out = run(visitBlockquote, doc, 11);
    expect(kinds(out)).toEqual([
      "line:cm-quote-line@0-0",
      "hide@0-2",
      "line:cm-quote-line@4-4",
      "hide@4-6",
      "hide@6-8",
    ]);
  });

  it("shows the marks in the markup color on the active line", () => {
    const out = run(visitBlockquote, "> a\n> b", 1);
    expect(kinds(out)).toEqual([
      "line:cm-quote-line@0-0",
      "mark:cm-mark@0-1",
      "line:cm-quote-line@4-4",
      "hide@4-6",
    ]);
  });
});

describe("hr", () => {
  it("renders a rule when inactive and muted source when active", () => {
    const doc = "a\n\n---\n\nb";
    expect(kinds(run(visitHr, doc, 0))).toEqual(["widget:RuleWidget@3-6"]);
    expect(kinds(run(visitHr, doc, 4))).toEqual(["mark:cm-mark@3-6"]);
  });
});

describe("spelling exclusions", () => {
  it("marks code, URLs and autolinks per line and leaves prose alone", () => {
    const doc = "Some `code` and <https://x.ch>\n\n```\nab\n```\n";
    expect(kinds(run(visitSpelling, doc, 0))).toEqual([
      "mark:cm-nospell@5-11",
      "mark:cm-nospell@16-30",
      "mark:cm-nospell@32-35",
      "mark:cm-nospell@36-38",
      "mark:cm-nospell@39-42",
    ]);
  });
});

describe("code fences", () => {
  const doc = "p\n\n```ts\nlet a = 1;\n```\n\nq";
  // Fence: 3..23; opening line 3..8, code line 9..19, closing line 20..23.

  it("replaces both fence lines and collapses the closing one when inactive", () => {
    const out = run(visitCodeFence, doc, 0);
    expect(kinds(out)).toEqual([
      "line:cm-code-line cm-code-first@3-3",
      "widget:LanguageSelectWidget@3-8",
      "line:cm-code-line cm-code-last@9-9",
      "line:cm-code-close@20-20",
      "widget:EmptyWidget@20-23",
    ]);
  });

  it("keeps the closing line of an empty fence as padding", () => {
    const out = run(visitCodeFence, "p\n\n```\n```\n", 0);
    expect(kinds(out)).toContain("line:cm-code-line cm-code-last@7-7");
    expect(kinds(out).some((k) => k.includes("cm-code-close"))).toBe(false);
  });

  it("shows the fences when the selection is inside the block", () => {
    const out = run(visitCodeFence, doc, 12);
    expect(kinds(out)).toEqual([
      "line:cm-code-line cm-code-first@3-3",
      "mark:cm-mark@3-6",
      "mark:cm-code-info@6-8",
      "line:cm-code-line@9-9",
      "line:cm-code-line cm-code-last@20-20",
      "mark:cm-mark@20-23",
    ]);
  });

  it("does not empty the last line of an unterminated fence", () => {
    const out = run(visitCodeFence, "```\ncode", 0);
    expect(kinds(out)).toEqual([
      "line:cm-code-line cm-code-first@0-0",
      "mark:cm-mark@0-3",
      "line:cm-code-line cm-code-last@4-4",
    ]);
    const inactive = run(visitCodeFence, "x\n\n```\ncode", 0);
    expect(kinds(inactive)).toContain("widget:LanguageSelectWidget@3-6");
    expect(kinds(inactive)).not.toContain("widget:EmptyWidget@7-11");
  });

  it("styles indented code blocks", () => {
    const out = run(visitCodeFence, "p\n\n    code\n", 0);
    expect(kinds(out)).toEqual(["line:cm-code-line cm-code-first cm-code-last@3-3"]);
  });

  it("extracts the language from an info string", () => {
    expect(infoLanguage("ts")).toBe("ts");
    expect(infoLanguage("  json {meta}")).toBe("json");
    expect(infoLanguage("")).toBe("");
  });
});

function blocks(visit: BlockVisitor, doc: string, cursor?: number): string[] {
  const state = stateWith(doc, cursor);
  const specs = collectBlocks(state, visit);
  const rendered = renderBlocks(state, specs);
  return kinds({ decorations: rendered, atomic: rendered });
}

describe("tables", () => {
  const doc = "p\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nq";
  // Table: 3..32.

  it("renders the whole table as one block widget when inactive", () => {
    expect(blocks(visitTableBlocks, doc, 0)).toEqual(["widget:TableWidget@3-32"]);
    expect(blocks(visitTableBlocks, doc, 34)).toEqual(["widget:TableWidget@3-32"]);
  });

  it("shows the raw rows when the selection touches the table", () => {
    expect(blocks(visitTableBlocks, doc, 3)).toEqual([]);
    expect(blocks(visitTableBlocks, doc, 32)).toEqual([]);
    expect(blocks(visitTableBlocks, doc, 15)).toEqual([]);
  });

  it("styles the raw rows only while active", () => {
    expect(listDecorations(run(visitTable, doc, 0))).toEqual([]);
    const active = listDecorations(run(visitTable, doc, 5));
    expect(active.filter((e) => e.kind.startsWith("line:cm-table-line"))).toHaveLength(3);
    // Three pipes per cell row plus the delimiter row as one node.
    expect(active.filter((e) => e.kind.startsWith("mark:cm-table-delimiter"))).toHaveLength(7);
    expect(active.filter((e) => e.kind === "mark:cm-table-delimiter cm-table-pipe")).toHaveLength(
      6,
    );
    expect(active.filter((e) => e.kind === "mark:cm-table-delimiter")).toEqual([
      { from: 13, to: 22, kind: "mark:cm-table-delimiter" },
    ]);
  });

  it("highlights the cell at the cursor and, from a body cell, its header cell", () => {
    const cells = (cursor: number): string[] =>
      kinds(run(visitTable, doc, cursor)).filter((k) => k.includes("-active"));
    // In the header: the slot " a " between the pipes, nothing else.
    expect(cells(5)).toEqual(["mark:cm-table-cell-active@4-7"]);
    // In a body cell: its slot and the header slot above it.
    expect(cells(25)).toEqual([
      "mark:cm-table-header-active@4-7",
      "mark:cm-table-cell-active@24-27",
    ]);
    expect(cells(29)).toEqual([
      "mark:cm-table-header-active@8-11",
      "mark:cm-table-cell-active@28-31",
    ]);
    // On the delimiter row there is no cell to highlight.
    expect(cells(15)).toEqual([]);
  });

  it("highlights empty cells and rows without a leading pipe", () => {
    const sparse = "a | b\n--|--\n| |";
    // Row 3 is "| |": its only cell is empty, its slot the space between the pipes.
    expect(kinds(run(visitTable, sparse, 13)).filter((k) => k.includes("-active"))).toEqual([
      "mark:cm-table-header-active@0-2",
      "mark:cm-table-cell-active@13-14",
    ]);
    // The header has no leading pipe: the slot starts at the row.
    expect(kinds(run(visitTable, sparse, 0)).filter((k) => k.includes("-active"))).toEqual([
      "mark:cm-table-cell-active@0-2",
    ]);
  });

  it("finds tables nested in lists and quotes", () => {
    const nested = "- item\n\n  | a |\n  |---|\n  | 1 |\n\n> | q |\n> |---|\n> | r |";
    expect(blocks(visitTableBlocks, nested, 0)).toEqual([
      "widget:TableWidget@10-31",
      "widget:TableWidget@35-56",
    ]);
  });
});

describe("mermaid", () => {
  const doc = "p\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nq";
  // Fence: 3..36.

  it("renders a mermaid fence as a block widget when inactive", () => {
    expect(blocks(visitMermaidBlocks, doc, 0)).toEqual(["widget:MermaidWidget@3-36"]);
    expect(blocks(visitMermaidBlocks, doc, 20)).toEqual([]);
  });

  it("ignores other fences", () => {
    expect(blocks(visitMermaidBlocks, "```ts\nlet a;\n```", 0)).toEqual([]);
  });

  it("is left alone by the code fence family while inactive", () => {
    expect(kinds(run(visitCodeFence, doc, 0))).toEqual([]);
    const active = kinds(run(visitCodeFence, doc, 20));
    expect(active).toContain("mark:cm-mark@3-6");
    expect(active).toContain("mark:cm-code-info@6-13");
  });
});

describe("images", () => {
  const doc = 'see ![alt](img/a.png "t") here\n\nx';

  it("replaces a local image with a widget when inactive", () => {
    expect(kinds(run(visitInline, doc, 32))).toEqual(["widget:ImageWidget@4-25"]);
  });

  it("shows the source with markup colors when active", () => {
    expect(kinds(run(visitInline, doc, 2))).toEqual([
      "mark:cm-mark@4-6",
      "mark:cm-image@4-25",
      "mark:cm-mark@9-10",
      "mark:cm-mark@10-11",
      "mark:cm-url@11-20",
      "mark:cm-mark@24-25",
    ]);
  });

  it("keeps remote images as styled text", () => {
    const remote = "![r](https://x.y/a.png)\n\nx";
    expect(kinds(run(visitInline, remote, 26))).toEqual(["mark:cm-image@0-23"]);
  });
});
