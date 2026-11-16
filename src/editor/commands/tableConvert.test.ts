import type { EditorState, StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stateWith, type Cursor } from "../testing";
import { tableAt } from "./table";
import {
  escapeCell,
  gridFromLines,
  gridOfRows,
  gridToList,
  insertTable,
  listRows,
  parseList,
  tableFromSelection,
  tableToList,
} from "./tableConvert";

interface Result {
  doc: string;
  head: number;
  handled: boolean;
  state: EditorState;
}

function apply(command: StateCommand, doc: string, cursor: number | Cursor): Result {
  let state: EditorState = stateWith(doc, cursor);
  const handled = command({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  return { doc: state.doc.toString(), head: state.selection.main.head, handled, state };
}

const EMPTY = "|     |     |\n| --- | --- |\n|     |     |";

describe("parseList", () => {
  it("reads nested items with their depth", () => {
    expect(parseList(["- a", "  - b", "    - c", "  - d", "- e"])).toEqual([
      { depth: 0, text: "a" },
      { depth: 1, text: "b" },
      { depth: 2, text: "c" },
      { depth: 1, text: "d" },
      { depth: 0, text: "e" },
    ]);
  });

  it("accepts ordered markers, tasks, tabs and continuation lines", () => {
    expect(parseList(["1. one", "\t* [ ] two", "    more", "2) three", "lazy"])).toEqual([
      { depth: 0, text: "one" },
      { depth: 1, text: "[ ] two more" },
      { depth: 0, text: "three lazy" },
    ]);
  });

  it("starts at depth 0 inside a sub-list and skips blank lines", () => {
    expect(parseList(["  - b", "", "  - c", "- d"])).toEqual([
      { depth: 0, text: "b" },
      { depth: 0, text: "c" },
      { depth: 0, text: "d" },
    ]);
  });

  it("rejects text that is not a list", () => {
    expect(parseList(["plain", "- a"])).toBeNull();
    expect(parseList(["- a", "", "paragraph"])).toBeNull();
    expect(parseList(["---"])).toBeNull();
    expect(parseList([""])).toBeNull();
  });
});

describe("listRows", () => {
  it("puts a first child on its parent's row and later siblings on new rows", () => {
    const entries = parseList([
      "- Fruits",
      "  - Apple",
      "  - Banana",
      "- Vegetables",
      "  - Carrot",
    ]);
    expect(listRows(entries ?? [])).toEqual([
      ["Fruits", "Apple"],
      ["", "Banana"],
      ["Vegetables", "Carrot"],
    ]);
  });

  it("gives a flat list one column", () => {
    expect(listRows(parseList(["- a", "- b"]) ?? [])).toEqual([["a"], ["b"]]);
  });

  it("pads rows to the deepest level", () => {
    expect(listRows(parseList(["- a", "  - b", "    - c", "- d"]) ?? [])).toEqual([
      ["a", "b", "c"],
      ["d", "", ""],
    ]);
  });
});

describe("escapeCell", () => {
  it("escapes pipes once", () => {
    expect(escapeCell("a | b \\| c")).toBe("a \\| b \\| c");
  });
});

describe("gridFromLines", () => {
  it("uses an empty header for lists and plain lines", () => {
    const list = gridFromLines(["- a", "  - b"]);
    expect(list?.header.cells).toEqual(["", ""]);
    expect(list?.body.map((row) => row.cells)).toEqual([["a", "b"]]);
    const plain = gridFromLines(["one", "", "two | x"]);
    expect(plain?.header.cells).toEqual([""]);
    expect(plain?.body.map((row) => row.cells)).toEqual([["one"], ["two \\| x"]]);
  });

  it("splits tab-separated lines with the first as header", () => {
    const grid = gridFromLines(["Name\tAge", "Ann\t31", "Bob"]);
    expect(grid?.header.cells).toEqual(["Name", "Age"]);
    expect(grid?.body.map((row) => row.cells)).toEqual([
      ["Ann", "31"],
      ["Bob", ""],
    ]);
  });

  it("returns null for blank lines", () => {
    expect(gridFromLines(["", "  "])).toBeNull();
  });
});

describe("gridToList", () => {
  it("is the reverse of the list rule", () => {
    const lines = ["- Fruits", "  - Apple", "  - Banana", "- Vegetables", "  - Carrot"];
    const grid = gridFromLines(lines);
    expect(grid && gridToList(grid)).toEqual(lines);
  });

  it("keeps a non-empty header as the first row and unescapes pipes", () => {
    const grid = gridOfRows(["Name", "Age"], [["a | b", "1"]]);
    expect(gridToList(grid)).toEqual(["- Name", "  - Age", "- a | b", "  - 1"]);
  });

  it("never nests more than one level below the item before", () => {
    const grid = gridOfRows(
      ["", "", ""],
      [
        ["a", "", "c"],
        ["", "", "d"],
      ],
    );
    expect(gridToList(grid)).toEqual(["- a", "  - c", "  - d"]);
  });
});

describe("insertTable", () => {
  it("fills a blank line, with blank lines around it", () => {
    const r = apply(insertTable, "before\n\nafter", 7);
    expect(r.doc).toBe(`before\n\n${EMPTY}\n\nafter`);
    expect(r.head).toBe(8 + 2);
    expect(tableAt(r.state, r.head)).not.toBeNull();
  });

  it("goes after the paragraph the cursor is in", () => {
    const r = apply(insertTable, "one\ntwo\n\nnext", 1);
    expect(r.doc).toBe(`one\ntwo\n\n${EMPTY}\n\nnext`);
    expect(r.head).toBe(9 + 2);
  });

  it("goes after the whole list and at the document end", () => {
    expect(apply(insertTable, "- a\n  - b", 1).doc).toBe(`- a\n  - b\n\n${EMPTY}`);
  });

  it("works in an empty document", () => {
    const r = apply(insertTable, "", 0);
    expect(r.doc).toBe(EMPTY);
    expect(tableAt(r.state, 2)?.header.cells.length).toBe(2);
  });
});

describe("tableFromSelection", () => {
  it("converts a selected nested list", () => {
    const doc = "intro\n- Fruits\n  - Apple\n  - Banana\n- Vegetables\nend";
    const r = apply(tableFromSelection, doc, { anchor: 8, head: 47 });
    expect(r.doc).toBe(
      [
        "intro",
        "",
        "|            |        |",
        "| ---------- | ------ |",
        "| Fruits     | Apple  |",
        "|            | Banana |",
        "| Vegetables |        |",
        "",
        "end",
      ].join("\n"),
    );
    const model = tableAt(r.state, r.head);
    expect(model?.body.length).toBe(3);
  });

  it("converts the list at the cursor when nothing is selected", () => {
    const r = apply(tableFromSelection, "- a\n  - b\n- c\n\ntext", 12);
    expect(r.doc).toBe("|     |     |\n| --- | --- |\n| a   | b   |\n| c   |     |\n\ntext");
  });

  it("converts plain lines, one row each", () => {
    const r = apply(tableFromSelection, "one\ntwo", { anchor: 0, head: 7 });
    expect(r.doc).toBe("|     |\n| --- |\n| one |\n| two |");
  });

  it("leaves out a last line the selection only touches at its start", () => {
    const r = apply(tableFromSelection, "one\ntwo", { anchor: 0, head: 4 });
    expect(r.doc).toBe("|     |\n| --- |\n| one |\n\ntwo");
  });

  it("does nothing inside a table or on a blank line", () => {
    expect(apply(tableFromSelection, EMPTY, 2).handled).toBe(false);
    expect(apply(tableFromSelection, "a\n\nb", 2).handled).toBe(false);
  });
});

describe("tableToList", () => {
  it("turns the table at the cursor into a nested list", () => {
    const doc = "text\n\n| | |\n|---|---|\n| a | b |\n| | c |\n\nend";
    const r = apply(tableToList, doc, 8);
    expect(r.doc).toBe("text\n\n- a\n  - b\n  - c\n\nend");
    expect(r.head).toBe(9);
  });

  it("keeps a container prefix on every line", () => {
    const r = apply(tableToList, "> | x | y |\n> |---|---|\n> | 1 | 2 |", 4);
    expect(r.doc).toBe("> - x\n>   - y\n> - 1\n>   - 2");
  });

  it("is not handled outside a table", () => {
    expect(apply(tableToList, "- a", 1).handled).toBe(false);
  });
});
