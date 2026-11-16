import { type EditorState, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stateWith, type Cursor } from "../testing";
import { toggleBullets, toggleTask, toggleTaskChange } from "./lists";

function run(state: EditorState): { doc: string; ran: boolean; head: number } {
  let next = state;
  const ran = toggleTask({
    state,
    dispatch: (tr: Transaction) => {
      next = tr.state;
    },
  });
  return { doc: next.doc.toString(), ran, head: next.selection.main.head };
}

describe("toggleTaskChange", () => {
  it("turns a plain line into an open task", () => {
    expect(toggleTaskChange(10, "buy milk")).toEqual({ from: 10, to: 10, insert: "- [ ] " });
    expect(toggleTaskChange(0, "  indented")).toEqual({ from: 2, to: 2, insert: "- [ ] " });
  });

  it("adds a box to a list item", () => {
    expect(toggleTaskChange(0, "- item")).toEqual({ from: 2, to: 2, insert: "[ ] " });
    expect(toggleTaskChange(0, "3. item")).toEqual({ from: 3, to: 3, insert: "[ ] " });
    expect(toggleTaskChange(0, "  * item")).toEqual({ from: 4, to: 4, insert: "[ ] " });
  });

  it("checks and unchecks an existing box", () => {
    expect(toggleTaskChange(0, "- [ ] open")).toEqual({ from: 3, to: 4, insert: "x" });
    expect(toggleTaskChange(0, "- [x] done")).toEqual({ from: 3, to: 4, insert: " " });
    expect(toggleTaskChange(0, "- [X] done")).toEqual({ from: 3, to: 4, insert: " " });
  });

  it("keeps blockquote prefixes", () => {
    expect(toggleTaskChange(0, "> - [ ] quoted")).toEqual({ from: 5, to: 6, insert: "x" });
    expect(toggleTaskChange(0, "> text")).toEqual({ from: 2, to: 2, insert: "- [ ] " });
  });
});

describe("toggleTask", () => {
  it("toggles every line of the selection once and keeps the cursor on its text", () => {
    const doc = "- [ ] a\n- b\nc";
    const r = run(stateWith(doc, { anchor: 0, head: doc.length }));
    expect(r.doc).toBe("- [x] a\n- [ ] b\n- [ ] c");
    expect(r.head).toBe(r.doc.length);
  });

  it("moves the cursor with the inserted marker", () => {
    const r = run(stateWith("task", 2));
    expect(r.doc).toBe("- [ ] task");
    expect(r.head).toBe(8);
    expect(r.ran).toBe(true);
  });
});

function bullets(doc: string, cursor: number | Cursor): { doc: string; ran: boolean } {
  let state: EditorState = stateWith(doc, cursor);
  const ran = toggleBullets({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  return { doc: state.doc.toString(), ran };
}

const all = (doc: string): Cursor => ({ anchor: 0, head: doc.length });

describe("toggleBullets", () => {
  it("bullets the line at the cursor", () => {
    expect(bullets("milk", 2).doc).toBe("- milk");
  });

  it("makes one item per line of a paragraph", () => {
    const doc = "milk\neggs\nbread";
    expect(bullets(doc, all(doc)).doc).toBe("- milk\n- eggs\n- bread");
  });

  it("makes one item per paragraph and drops the blank lines between them", () => {
    const doc = "First idea.\n\nSecond idea.\n\n\nThird.";
    expect(bullets(doc, all(doc)).doc).toBe("- First idea.\n- Second idea.\n- Third.");
  });

  it("keeps quote prefixes and indentation", () => {
    const doc = "> one\n>\n> two";
    expect(bullets(doc, all(doc)).doc).toBe("> - one\n> - two");
    expect(bullets("  nested", 3).doc).toBe("  - nested");
  });

  it("leaves existing items as they are when adding", () => {
    const doc = "- a\nb\n1. c";
    expect(bullets(doc, all(doc)).doc).toBe("- a\n- b\n1. c");
  });

  it("removes markers and task boxes when every line is an item", () => {
    const doc = "- a\n* [x] b\n  2. c";
    expect(bullets(doc, all(doc)).doc).toBe("a\nb\n  c");
  });

  it("toggles back to the same source", () => {
    const doc = "milk\neggs";
    const on = bullets(doc, all(doc)).doc;
    expect(bullets(on, all(on)).doc).toBe(doc);
  });

  it("leaves code blocks and tables alone", () => {
    const doc = "intro\n\n```\ncode\n```\n\n| a |\n|---|\n| 1 |\n\nend";
    expect(bullets(doc, all(doc)).doc).toBe(
      "- intro\n\n```\ncode\n```\n\n| a |\n|---|\n| 1 |\n\n- end",
    );
  });

  it("ignores a last line the selection only touches at its start", () => {
    expect(bullets("a\nb", { anchor: 0, head: 2 }).doc).toBe("- a\n\nb");
  });

  it("separates the following paragraph line so it is not absorbed", () => {
    expect(bullets("a\nb\n\nc", 0).doc).toBe("- a\n\nb\n\nc");
    expect(bullets("a\n\nb", 0).doc).toBe("- a\n\nb");
    expect(bullets("a\n- b", 0).doc).toBe("- a\n- b");
  });

  it("does nothing on blank lines", () => {
    expect(bullets("a\n\nb", 2).ran).toBe(false);
  });
});
