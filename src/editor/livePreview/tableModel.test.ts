import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stateWith } from "../testing";
import {
  alignChanges,
  cellAt,
  cellRange,
  displayWidth,
  emptyRow,
  formatTable,
  splitCells,
  tableModel,
  type TableModel,
} from "./tableModel";

function modelOf(doc: string, index = 0): { state: EditorState; model: TableModel } {
  const state = stateWith(doc);
  const tables: TableModel[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Table") {
        const model = tableModel(state, node.node);
        if (model) {
          tables.push(model);
        }
        return false;
      }
      return undefined;
    },
  });
  const model = tables[index];
  if (!model) {
    throw new Error("no table parsed");
  }
  return { state, model };
}

describe("splitCells", () => {
  it("splits on unescaped pipes and trims", () => {
    expect(splitCells("| a | b |").map((c) => c.text)).toEqual(["a", "b"]);
    expect(splitCells("a | b").map((c) => c.text)).toEqual(["a", "b"]);
    expect(splitCells("| a \\| b | c |").map((c) => c.text)).toEqual(["a \\| b", "c"]);
  });

  it("keeps empty cells between pipes and drops trailing whitespace", () => {
    expect(splitCells("| a |  | c |  ").map((c) => c.text)).toEqual(["a", "", "c"]);
    expect(splitCells("|  |").map((c) => c.text)).toEqual([""]);
  });

  it("reports offsets of the trimmed content", () => {
    const cells = splitCells("|  ab | c|");
    expect(cells[0]).toEqual({ from: 3, to: 5, end: 6, text: "ab" });
    expect(cells[1]).toEqual({ from: 8, to: 9, end: 9, text: "c" });
  });
});

describe("tableModel", () => {
  const doc =
    "| Left | Center | Right |\n| :--- | :----: | ----: |\n| a | b | c |\n| **d** |  | f | extra |";

  it("reads rows, cells, alignment and the table range", () => {
    const { model } = modelOf(doc);
    expect(model.from).toBe(0);
    expect(model.to).toBe(doc.length);
    expect(model.aligns).toEqual(["left", "center", "right"]);
    expect(model.header.cells.map((c) => c.text)).toEqual(["Left", "Center", "Right"]);
    expect(model.body).toHaveLength(2);
    expect(model.body[1]?.cells.map((c) => c.text)).toEqual(["**d**", "", "f", "extra"]);
    expect(model.header.cells[1]).toMatchObject({ from: 9, to: 15 });
  });

  it("keeps list indentation and quote marks as row prefixes", () => {
    const { model } = modelOf("- item\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |");
    expect(model.header.prefix).toBe("  ");
    expect(model.delimiter.prefix).toBe("  ");
    expect(model.body[0]?.prefix).toBe("  ");
    const quoted = modelOf("> | q |\n> |---|\n> | r |").model;
    expect(quoted.header.prefix).toBe("> ");
    expect(quoted.body[0]?.prefix).toBe("> ");
  });

  it("handles tables without leading and trailing pipes", () => {
    const { model } = modelOf("Name | Value\n---- | -----\none  | 1");
    expect(model.header.cells.map((c) => c.text)).toEqual(["Name", "Value"]);
    expect(model.aligns).toEqual(["none", "none"]);
    expect(model.body[0]?.cells.map((c) => c.text)).toEqual(["one", "1"]);
  });
});

describe("formatTable", () => {
  it("pads columns to the widest cell and honors alignment", () => {
    const { model } = modelOf(
      "| Left | Center | Right |\n| :--- | :----: | ----: |\n| a | b | c |",
    );
    expect(formatTable(model)).toBe(
      ["| Left | Center | Right |", "| :--- | :----: | ----: |", "| a    |   b    |     c |"].join(
        "\n",
      ),
    );
  });

  it("fills missing cells, keeps extra cells, and rewrites prefixes", () => {
    const { model } = modelOf("> | a | b |\n> |---|---|\n> | 1 |\n> | 2 | 3 | 4 |");
    expect(formatTable(model)).toBe(
      ["| a   | b   |", "> | --- | --- |", "> | 1   |     |", "> | 2   | 3   | 4 |"].join("\n"),
    );
  });

  it("is idempotent and leaves an aligned table unchanged", () => {
    const aligned = "| a   | b   |\n| --- | --- |\n| 1   | 2   |";
    const { model } = modelOf(aligned);
    expect(formatTable(model)).toBe(aligned);
  });

  it("uses display width for wide characters", () => {
    expect(displayWidth("日本")).toBe(4);
    expect(displayWidth("ab")).toBe(2);
    const { model } = modelOf("| x | y |\n|---|---|\n| 日本 | 1 |");
    expect(formatTable(model).split("\n")[2]).toBe("| 日本 | 1   |");
  });

  it("produces the formatted table through gap-only changes", () => {
    const docs = [
      "| Left | Center | Right |\n| :--- | :----: | ----: |\n| a | b | c |\n| **d** |  | f | extra |",
      "> | a | b |\n> |---|---|\n> | 1 |\n> | 2 | 3 | 4 |",
      "Name | Value\n---- | -----\none  | 1",
      "| x | y |\n|---|---|\n| 日本 | 1 |",
    ];
    for (const doc of docs) {
      const { state, model } = modelOf(doc);
      const applied = state.update({ changes: alignChanges(model) }).state;
      const expected = `${doc.slice(0, model.from)}${formatTable(model)}${doc.slice(model.to)}`;
      expect(applied.doc.toString()).toBe(expected);
    }
  });

  it("builds an empty row with the table's widths and prefix", () => {
    const { model } = modelOf("  | ab | c |\n  |----|---|\n  | 1 | 2 |");
    expect(emptyRow(model)).toBe("  |     |     |");
  });
});

describe("cellAt / cellRange", () => {
  const doc = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 |";

  it("finds header and body cells, including padding positions", () => {
    const { model } = modelOf(doc);
    expect(cellAt(model, 2)).toEqual({ row: 0, cell: 0 });
    expect(cellAt(model, 4)).toEqual({ row: 0, cell: 0 });
    expect(cellAt(model, 5)).toEqual({ row: 0, cell: 1 });
    expect(cellAt(model, 0)).toEqual({ row: 0, cell: 0 });
    expect(cellAt(model, 26)).toEqual({ row: 1, cell: 1 });
    expect(cellAt(model, 32)).toEqual({ row: 2, cell: 0 });
  });

  it("maps the delimiter row to the last header cell", () => {
    const { model } = modelOf(doc);
    expect(cellAt(model, 12)).toEqual({ row: 0, cell: 1 });
  });

  it("returns null for positions outside the table and missing cells", () => {
    const { model } = modelOf(`${doc}\n\ntext`);
    expect(cellAt(model, doc.length + 3)).toBeNull();
    expect(cellRange(model, { row: 2, cell: 1 })).toBeNull();
    expect(cellRange(model, { row: 1, cell: 1 })).toMatchObject({ from: 26, to: 27, text: "2" });
  });
});
