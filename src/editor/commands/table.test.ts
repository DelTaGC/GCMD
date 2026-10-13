import type { EditorState, StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stateWith } from "../testing";
import { alignTable, nextCell, prevCell, tableAt } from "./table";

interface Result {
  doc: string;
  anchor: number;
  head: number;
  handled: boolean;
}

function apply(command: StateCommand, doc: string, cursor: number): Result {
  let state: EditorState = stateWith(doc, cursor);
  const handled = command({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  const range = state.selection.main;
  return { doc: state.doc.toString(), anchor: range.anchor, head: range.head, handled };
}

const TABLE = "| a | b |\n|---|---|\n| 1 | 2 |";

describe("tableAt", () => {
  it("finds the table containing a position and nothing elsewhere", () => {
    const state = stateWith(`text\n\n${TABLE}\n\nafter`);
    expect(tableAt(state, 6)?.from).toBe(6);
    expect(tableAt(state, 6 + TABLE.length)?.from).toBe(6);
    expect(tableAt(state, 2)).toBeNull();
    expect(tableAt(state, 6 + TABLE.length + 2)).toBeNull();
  });
});

describe("nextCell / prevCell", () => {
  it("selects the next cell's content", () => {
    const r = apply(nextCell, TABLE, 2);
    expect(r.handled).toBe(true);
    expect([r.anchor, r.head]).toEqual([6, 7]);
  });

  it("skips the delimiter row from the header to the first body cell", () => {
    const r = apply(nextCell, TABLE, 6);
    expect([r.anchor, r.head]).toEqual([22, 23]);
  });

  it("appends an empty row after the last cell and places the cursor in it", () => {
    const r = apply(nextCell, TABLE, 26);
    expect(r.doc).toBe(`${TABLE}\n|     |     |`);
    expect(r.anchor).toBe(TABLE.length + 1 + 2);
    expect(r.anchor).toBe(r.head);
  });

  it("goes back to the previous cell and stops at the first", () => {
    const r = apply(prevCell, TABLE, 22);
    expect([r.anchor, r.head]).toEqual([6, 7]);
    const first = apply(prevCell, TABLE, 2);
    expect(first.handled).toBe(true);
    expect(first.doc).toBe(TABLE);
    expect([first.anchor, first.head]).toEqual([2, 2]);
  });

  it("does nothing outside a table", () => {
    const r = apply(nextCell, "plain text", 3);
    expect(r.handled).toBe(false);
    expect(r.doc).toBe("plain text");
  });
});

describe("alignTable", () => {
  it("realigns the table at the cursor and maps the selection", () => {
    const doc = "| a | bbb |\n|---|---|\n| 111 | 2 |\n\ntail";
    const outside = apply(alignTable, doc, doc.length);
    expect(outside.handled).toBe(false);
    expect(outside.doc).toBe(doc);
    const inside = apply(alignTable, doc, 24);
    expect(inside.handled).toBe(true);
    expect(inside.doc).toBe("| a   | bbb |\n| --- | --- |\n| 111 | 2   |\n\ntail");
    // The cursor sat on "11|1" and stays there: only whitespace around cells moves.
    expect(inside.head).toBe(30);
  });

  it("leaves an aligned table untouched", () => {
    const aligned = "| a   | b   |\n| --- | --- |\n| 1   | 2   |";
    const r = apply(alignTable, aligned, 2);
    expect(r.handled).toBe(true);
    expect(r.doc).toBe(aligned);
  });

  it("preserves escaped pipes and content", () => {
    const doc = "| a \\| b | c |\n|---|---|\n| 1 | 2 |";
    const r = apply(alignTable, doc, 2);
    expect(r.doc).toBe("| a \\| b | c   |\n| ------ | --- |\n| 1      | 2   |");
    expect(r.head).toBe(2);
  });
});
