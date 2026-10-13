import { type EditorState, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stateWith } from "../testing";
import { toggleTask, toggleTaskChange } from "./lists";

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
