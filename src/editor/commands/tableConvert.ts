/**
 * Creating tables and converting between tables and lists.
 *
 * - `insertTable`: an empty table (two columns, header and one body row).
 * - `tableFromSelection`: the selected lines (or, with no selection, the
 *   list or paragraph at the cursor) become a table. A list gives one row
 *   per leaf item and one column per nesting level: an item shares the row
 *   of its parent when it is the parent's first child, later siblings start
 *   a new row with the parent's cell left empty. Tab-separated lines (a
 *   spreadsheet paste) are split on the tabs, the first line being the
 *   header; any other line is one single-cell row.
 * - `tableToList`: the reverse of the list rule. Each non-empty cell is an
 *   item, the child of the nearest filled cell to its left on the current
 *   branch (so a skipped column never nests two levels at once); an
 *   all-empty header row is dropped.
 *
 * The pure parts (`parseList`, `listRows`, `gridFromLines`, `gridToList`)
 * work on plain strings; the commands write one undoable transaction and
 * keep a blank line between the table and the text around it, since a GFM
 * table otherwise absorbs the next line as a row.
 */
import { isolateHistory } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  type EditorState,
  type StateCommand,
  type Transaction,
} from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { formatGrid, gridOf, type Grid } from "../livePreview/tableModel";
import { tableAt } from "./table";

// ---------------------------------------------------------------------------
// Pure conversion

export interface ListEntry {
  /** Nesting level, 0 for the outermost selected items. */
  readonly depth: number;
  /** The item's text without its marker; continuation lines joined by a space. */
  readonly text: string;
}

/** A bullet (`-`, `+`, `*`) or ordered (`1.`, `1)`) list item line. */
const LIST_ITEM = /^([ \t]*)(?:[-+*]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;

/** Leading whitespace width, tabs to the next multiple of 4. */
function indentWidth(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") {
      width += 1;
    } else if (ch === "\t") {
      width += 4 - (width % 4);
    } else {
      break;
    }
  }
  return width;
}

/**
 * Reads lines as a (possibly nested) list, or null when they are not one:
 * the first non-blank line must be an item, and every other non-blank line
 * an item, an indented continuation, or a lazy continuation right after an
 * item line. Depths come from the indentation, relative to the items seen
 * so far, so a selection starting inside a sub-list begins at depth 0.
 */
export function parseList(lines: readonly string[]): ListEntry[] | null {
  const entries: { depth: number; text: string }[] = [];
  const stack: number[] = [];
  let afterBlank = false;
  for (const line of lines) {
    if (line.trim() === "") {
      afterBlank = true;
      continue;
    }
    const indent = indentWidth(line);
    const match = LIST_ITEM.exec(line);
    if (match) {
      while (stack.length > 0 && (stack[stack.length - 1] ?? 0) > indent) {
        stack.pop();
      }
      if (stack.length === 0 || (stack[stack.length - 1] ?? 0) < indent) {
        stack.push(indent);
      }
      entries.push({ depth: stack.length - 1, text: (match[2] ?? "").trim() });
    } else {
      const last = entries[entries.length - 1];
      if (!last || (afterBlank && indent === 0)) {
        return null;
      }
      last.text = `${last.text} ${line.trim()}`.trim();
    }
    afterBlank = false;
  }
  return entries.length > 0 ? entries : null;
}

/** Pads every row with empty cells to the widest row. */
function padRows(rows: readonly (readonly string[])[], columns: number): string[][] {
  return rows.map((row) => Array.from({ length: columns }, (_, c) => row[c] ?? ""));
}

/** The table rows of a list: one per leaf, one column per nesting level. */
export function listRows(entries: readonly ListEntry[]): string[][] {
  const rows: string[][] = [];
  let previous = -1;
  let columns = 0;
  for (const entry of entries) {
    const current = rows[rows.length - 1];
    // A first child continues its parent's row; anything else starts a row.
    const row = current && entry.depth === previous + 1 ? current : [];
    if (row !== current) {
      rows.push(row);
    }
    while (row.length < entry.depth) {
      row.push("");
    }
    row[entry.depth] = entry.text;
    previous = entry.depth;
    columns = Math.max(columns, entry.depth + 1);
  }
  return padRows(rows, columns);
}

/** Escapes the pipes of a cell's text (an already escaped one is kept). */
export function escapeCell(text: string): string {
  return text.replace(/\\?\|/g, (match) => (match.length === 2 ? match : "\\|"));
}

function unescapeCell(text: string): string {
  return text.replace(/\\\|/g, "|");
}

/** A grid of the given rows, all columns unaligned, without row prefixes. */
export function gridOfRows(header: readonly string[], body: readonly (readonly string[])[]): Grid {
  const columns = Math.max(1, header.length, ...body.map((row) => row.length));
  const [head = [], ...rest] = padRows([header, ...body], columns).map((row) =>
    row.map(escapeCell),
  );
  return {
    aligns: Array.from({ length: columns }, () => "none" as const),
    header: { prefix: "", cells: head },
    delimiterPrefix: "",
    body: rest.map((cells) => ({ prefix: "", cells })),
  };
}

/**
 * The grid for selected lines, or null when they are all blank. A list gets
 * an empty header; tab-separated lines use their first line as header;
 * other lines are single-cell rows under an empty header.
 */
export function gridFromLines(lines: readonly string[]): Grid | null {
  const list = parseList(lines);
  if (list) {
    const rows = listRows(list);
    return gridOfRows(
      (rows[0] ?? []).map(() => ""),
      rows,
    );
  }
  const filled = lines.filter((line) => line.trim() !== "");
  if (filled.length === 0) {
    return null;
  }
  if (filled.some((line) => line.includes("\t"))) {
    const [header = [], ...body] = filled.map((line) =>
      line.split("\t").map((cell) => cell.trim()),
    );
    return gridOfRows(header, body);
  }
  return gridOfRows(
    [""],
    filled.map((line) => [line.trim()]),
  );
}

/** The list lines of a grid (see the module comment); empty when every cell is. */
export function gridToList(grid: Grid): string[] {
  const rows = [grid.header.cells, ...grid.body.map((row) => row.cells)];
  const lines: string[] = [];
  // Depth of the item last written in each column of the current branch; an
  // item's parent is the nearest column to its left on that branch.
  const path: (number | undefined)[] = [];
  rows.forEach((cells, index) => {
    if (index === 0 && cells.every((cell) => cell.trim() === "")) {
      return;
    }
    cells.forEach((cell, column) => {
      const text = unescapeCell(cell.trim());
      if (text === "") {
        return;
      }
      let depth = 0;
      for (let left = Math.min(column, path.length) - 1; left >= 0; left -= 1) {
        const parent = path[left];
        if (parent !== undefined) {
          depth = parent + 1;
          break;
        }
      }
      lines.push(`${"  ".repeat(depth)}- ${text}`);
      path.length = column;
      path[column] = depth;
    });
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Commands

function isBlank(state: EditorState, lineNumber: number): boolean {
  return state.doc.line(lineNumber).text.trim() === "";
}

/**
 * Writes `grid` as a table in place of `from`..`to`, with a blank line
 * before and after it where text touches it. `from` is a line start (the
 * replaced lines), or a line end to insert after a non-blank line. The
 * cursor lands in the first header cell.
 */
function writeTable(state: EditorState, from: number, to: number, grid: Grid): Transaction {
  const doc = state.doc;
  const fromLine = doc.lineAt(from);
  let before = "";
  if (from !== fromLine.from) {
    before = "\n\n";
  } else if (fromLine.number > 1 && !isBlank(state, fromLine.number - 1)) {
    before = "\n";
  }
  const toLine = doc.lineAt(to);
  const after = toLine.number < doc.lines && !isBlank(state, toLine.number + 1) ? "\n" : "";
  const layout = formatGrid(grid, "aligned");
  const start = from + before.length;
  return state.update({
    changes: { from, to, insert: `${before}${layout.text}${after}` },
    selection: EditorSelection.cursor(start + (layout.cells[0]?.[0] ?? 0)),
    scrollIntoView: true,
    userEvent: "input.table",
    annotations: isolateHistory.of("full"),
  });
}

function treeOf(state: EditorState, pos: number): ReturnType<typeof syntaxTree> {
  return ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
}

/** End of the last line of the top-level block at `pos`, or of `pos`'s line. */
function blockEnd(state: EditorState, pos: number): number {
  for (let child = treeOf(state, pos).topNode.firstChild; child; child = child.nextSibling) {
    if (child.from <= pos && pos <= child.to) {
      return state.doc.lineAt(Math.max(child.from, child.to - 1)).to;
    }
  }
  return state.doc.lineAt(pos).to;
}

/**
 * Inserts an empty two-column table: on the cursor's line when it is blank,
 * otherwise after the block the cursor is in.
 */
export const insertTable: StateCommand = ({ state, dispatch }) => {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const grid = gridOfRows(["", ""], [["", ""]]);
  if (line.text.trim() === "") {
    dispatch(writeTable(state, line.from, line.to, grid));
  } else {
    const end = blockEnd(state, head);
    dispatch(writeTable(state, end, end, grid));
  }
  return true;
};

/** The lines of the outermost list, or else the paragraph, at `pos`. */
function blockLinesAt(state: EditorState, pos: number): { from: number; to: number } | null {
  let found: SyntaxNode | null = null;
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = treeOf(state, pos).resolveInner(pos, side); node;) {
      if (node.name === "BulletList" || node.name === "OrderedList") {
        found = node;
      } else if (node.name === "Paragraph" && !found) {
        found = node;
      }
      node = node.parent;
    }
    if (found) {
      break;
    }
  }
  if (!found) {
    return null;
  }
  return {
    from: state.doc.lineAt(found.from).from,
    to: state.doc.lineAt(Math.max(found.from, found.to - 1)).to,
  };
}

/** The whole lines a selection covers; a selection ending at a line start leaves that line out. */
function selectedLines(state: EditorState, from: number, to: number): { from: number; to: number } {
  const first = state.doc.lineAt(from);
  let last = state.doc.lineAt(to);
  if (to === last.from && to > from) {
    last = state.doc.lineAt(to - 1);
  }
  return { from: first.from, to: last.to };
}

/**
 * Turns the selected lines into a table (see the module comment). Without a
 * selection it converts the list or paragraph at the cursor. Does nothing
 * inside or across a table.
 */
export const tableFromSelection: StateCommand = ({ state, dispatch }) => {
  const main = state.selection.main;
  const range = main.empty
    ? blockLinesAt(state, main.head)
    : selectedLines(state, main.from, main.to);
  if (!range || tableAt(state, range.from) || tableAt(state, range.to)) {
    return false;
  }
  const grid = gridFromLines(state.doc.sliceString(range.from, range.to).split("\n"));
  if (!grid) {
    return false;
  }
  dispatch(writeTable(state, range.from, range.to, grid));
  return true;
};

/**
 * Turns the table at the cursor into a nested bullet list. Rows inside a
 * container (quote, list item) keep the header row's prefix.
 */
export const tableToList: StateCommand = ({ state, dispatch }) => {
  const model = tableAt(state, state.selection.main.head);
  if (!model) {
    return false;
  }
  const lines = gridToList(gridOf(model));
  if (lines.length === 0) {
    return true;
  }
  const prefix = model.header.prefix;
  const text = lines.map((line, index) => (index === 0 ? line : `${prefix}${line}`)).join("\n");
  dispatch(
    state.update({
      changes: { from: model.from, to: model.to, insert: text },
      selection: EditorSelection.cursor(model.from + (lines[0]?.length ?? 0)),
      scrollIntoView: true,
      userEvent: "input.table",
      annotations: isolateHistory.of("full"),
    }),
  );
  return true;
};
