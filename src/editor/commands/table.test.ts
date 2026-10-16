import type { EditorState, StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stateWith } from "../testing";
import {
  alignColumn,
  alignTable,
  columnAlignAt,
  deleteColumn,
  deleteRow,
  insertColumnLeft,
  insertColumnRight,
  insertRowAbove,
  insertRowBelow,
  moveColumnLeft,
  moveColumnRight,
  nextCell,
  nextRow,
  prevCell,
  tableAt,
} from "./table";

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

// The aligned form of TABLE: 13-character lines, cells at +2 and +8.
const ALIGNED = ["| a   | b   |", "| --- | --- |", "| 1   | 2   |"];
const BLANK = "|     |     |";
const lines = (...rows: string[]): string => rows.join("\n");

describe("nextRow (Enter)", () => {
  it("selects the same column of the next row, header to first body row", () => {
    const r = apply(nextRow, TABLE, 2);
    expect(r.handled).toBe(true);
    expect(r.doc).toBe(TABLE);
    expect([r.anchor, r.head]).toEqual([22, 23]);
  });

  it("appends an empty row from the last row and keeps the column", () => {
    const first = apply(nextRow, TABLE, 22);
    expect(first.doc).toBe(`${TABLE}\n${BLANK}`);
    expect([first.anchor, first.head]).toEqual([32, 32]);
    const second = apply(nextRow, TABLE, 26);
    expect(second.doc).toBe(`${TABLE}\n${BLANK}`);
    expect([second.anchor, second.head]).toEqual([38, 38]);
  });

  it("goes to the end of a short row when the cell is missing", () => {
    const doc = "| a | b |\n|---|---|\n| 1 |";
    const r = apply(nextRow, doc, 6);
    expect(r.doc).toBe(doc);
    expect([r.anchor, r.head]).toEqual([25, 25]);
  });

  it("does nothing outside a table", () => {
    expect(apply(nextRow, "plain", 2).handled).toBe(false);
  });
});

describe("insertRowAbove / insertRowBelow", () => {
  it("inserts below a body row and realigns the table", () => {
    const r = apply(insertRowBelow, TABLE, 22);
    expect(r.doc).toBe(lines(...ALIGNED, BLANK));
    expect([r.anchor, r.head]).toEqual([44, 44]);
  });

  it("inserts the first body row below the header", () => {
    const r = apply(insertRowBelow, TABLE, 2);
    expect(r.doc).toBe(lines(ALIGNED[0] ?? "", ALIGNED[1] ?? "", BLANK, ALIGNED[2] ?? ""));
    expect(r.head).toBe(30);
  });

  it("inserts above a body row, in the current column", () => {
    const r = apply(insertRowAbove, TABLE, 26);
    expect(r.doc).toBe(lines(ALIGNED[0] ?? "", ALIGNED[1] ?? "", BLANK, ALIGNED[2] ?? ""));
    expect(r.head).toBe(36);
  });

  it("above the header makes a new header and demotes the old one", () => {
    const r = apply(insertRowAbove, TABLE, 6);
    expect(r.doc).toBe(lines(BLANK, ALIGNED[1] ?? "", ALIGNED[0] ?? "", ALIGNED[2] ?? ""));
    expect(r.head).toBe(8);
  });

  it("keeps list and quote prefixes on the new row", () => {
    const doc = "- | a | b |\n  |---|---|\n  | 1 | 2 |";
    const below = apply(insertRowBelow, doc, 4);
    expect(below.doc).toBe("- | a   | b   |\n  | --- | --- |\n  |     |     |\n  | 1   | 2   |");
    const above = apply(insertRowAbove, doc, 4);
    expect(above.doc).toBe("- |     |     |\n  | --- | --- |\n  | a   | b   |\n  | 1   | 2   |");
    const quoted = apply(insertRowBelow, "> | a |\n> |---|\n> | 1 |", 20);
    expect(quoted.doc).toBe("> | a   |\n> | --- |\n> | 1   |\n> |     |");
  });

  it("does nothing outside a table", () => {
    const r = apply(insertRowBelow, "plain", 2);
    expect(r.handled).toBe(false);
    expect(r.doc).toBe("plain");
  });
});

describe("deleteRow", () => {
  it("deletes a body row and moves to the row that took its place", () => {
    const doc = lines(...ALIGNED, "| 3   | 4   |");
    const r = apply(deleteRow, doc, 30);
    expect(r.doc).toBe(lines(ALIGNED[0] ?? "", ALIGNED[1] ?? "", "| 3   | 4   |"));
    expect(r.head).toBe(30);
    const last = apply(deleteRow, doc, 50);
    expect(last.doc).toBe(lines(...ALIGNED));
    expect(last.head).toBe(36);
  });

  it("deleting the only body row keeps header and delimiter", () => {
    const r = apply(deleteRow, TABLE, 26);
    expect(r.doc).toBe(lines(ALIGNED[0] ?? "", ALIGNED[1] ?? ""));
    expect(r.head).toBe(8);
  });

  it("deleting the header promotes the first body row", () => {
    const r = apply(deleteRow, TABLE, 2);
    expect(r.doc).toBe(lines("| 1   | 2   |", ALIGNED[1] ?? ""));
    expect(r.head).toBe(2);
  });

  it("removes a table that is only a header", () => {
    const r = apply(deleteRow, "text\n\n| a | b |\n|---|---|\n\nafter", 8);
    expect(r.doc).toBe("text\n\n\nafter");
    expect(r.head).toBe(5);
    const start = apply(deleteRow, "| a | b |\n|---|---|", 2);
    expect(start.doc).toBe("");
  });
});

describe("insertColumnLeft / insertColumnRight / deleteColumn", () => {
  const WIDE = ["| a   |     | b   |", "| --- | --- | --- |", "| 1   |     | 2   |"];

  it("inserts an empty column and places the cursor in it", () => {
    const left = apply(insertColumnLeft, TABLE, 26);
    expect(left.doc).toBe(lines(...WIDE));
    expect(left.head).toBe(48);
    const right = apply(insertColumnRight, TABLE, 2);
    expect(right.doc).toBe(lines(...WIDE));
    expect(right.head).toBe(8);
  });

  it("pads short rows and keeps extra cells", () => {
    const doc = "| a | b |\n|---|---|\n| 1 |\n| 2 | 3 | 4 |";
    const r = apply(insertColumnRight, doc, 2);
    expect(r.doc).toBe(
      lines(
        "| a   |     | b   |",
        "| --- | --- | --- |",
        "| 1   |     |     |",
        "| 2   |     | 3   | 4 |",
      ),
    );
  });

  it("deletes the current column and never the last one", () => {
    const r = apply(deleteColumn, TABLE, 2);
    expect(r.doc).toBe(lines("| b   |", "| --- |", "| 2   |"));
    expect(r.head).toBe(2);
    const last = apply(deleteColumn, TABLE, 26);
    expect(last.doc).toBe(lines("| a   |", "| --- |", "| 1   |"));
    expect(last.head).toBe(18);
    const single = apply(deleteColumn, "| a |\n|---|\n| 1 |", 2);
    expect(single.handled).toBe(true);
    expect(single.doc).toBe("| a |\n|---|\n| 1 |");
  });
});

describe("moveColumnLeft / moveColumnRight", () => {
  it("swaps with the neighbour and follows the column, keeping the offset", () => {
    const r = apply(moveColumnRight, TABLE, 3);
    expect(r.doc).toBe(lines("| b   | a   |", "| --- | --- |", "| 2   | 1   |"));
    expect(r.head).toBe(9);
    const back = apply(moveColumnLeft, r.doc, 9);
    expect(back.doc).toBe(lines(...ALIGNED));
    expect(back.head).toBe(3);
  });

  it("stops at the edges", () => {
    const r = apply(moveColumnLeft, TABLE, 2);
    expect(r.handled).toBe(true);
    expect(r.doc).toBe(TABLE);
  });

  it("moves alignment and escaped pipes with the column", () => {
    const doc = "| a \\| b | c |\n|:--|--:|\n| 1 | 2 |";
    const r = apply(moveColumnRight, doc, 2);
    expect(r.doc).toBe(lines("|   c | a \\| b |", "| --: | :----- |", "|   2 | 1      |"));
  });
});

describe("alignColumn", () => {
  it("rewrites the delimiter cell of the current column", () => {
    const r = apply(alignColumn("center"), TABLE, 22);
    expect(r.doc).toBe(lines("|  a  | b   |", "| :-: | --- |", "|  1  | 2   |"));
    expect(r.head).toBe(31);
    // Cursor at the end of "b" (offset 1) follows the cell as it is padded.
    const right = apply(alignColumn("right"), r.doc, 9);
    expect(right.doc).toBe(lines("|  a  |   b |", "| :-: | --: |", "|  1  |   2 |"));
    expect(right.head).toBe(11);
  });

  it("is a no-op when the alignment is unchanged", () => {
    const aligned = lines(...ALIGNED);
    const r = apply(alignColumn("none"), aligned, 2);
    expect(r.handled).toBe(true);
    expect(r.doc).toBe(aligned);
  });

  it("reports the alignment at the cursor", () => {
    const state = stateWith("| a | b |\n|:--|--:|\n| 1 | 2 |", 2);
    expect(columnAlignAt(state)).toBe("left");
    expect(columnAlignAt(stateWith("| a | b |\n|:--|--:|\n| 1 | 2 |", 26))).toBe("right");
    expect(columnAlignAt(stateWith("plain", 2))).toBeNull();
  });
});
