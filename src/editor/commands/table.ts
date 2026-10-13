/**
 * Table commands: cell navigation (Tab / Shift+Tab) and alignment.
 *
 * `alignTableChange` is also used by the live-preview table family to
 * realign a table when the selection leaves it after an edit.
 */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type StateCommand,
} from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  alignChanges,
  cellAt,
  cellRange,
  emptyRow,
  tableModel,
  type TableModel,
} from "../livePreview/tableModel";

function tableNodeAt(state: EditorState, pos: number): SyntaxNode | null {
  const tree = ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
  for (const side of [1, -1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(pos, side);
    while (node) {
      if (node.name === "Table") {
        return node;
      }
      node = node.parent;
    }
  }
  return null;
}

/** The table whose block contains `pos` (inclusive at both ends), if any. */
export function tableAt(state: EditorState, pos: number): TableModel | null {
  const node = tableNodeAt(state, pos);
  if (!node) {
    return null;
  }
  const model = tableModel(state, node);
  if (!model || pos < state.doc.lineAt(model.from).from || pos > model.to) {
    return null;
  }
  return model;
}

/**
 * The changes that realign `model`, or null when it is already aligned. Only
 * the whitespace and pipes between cells are rewritten, so a selection
 * inside a cell keeps its place.
 */
export function alignTableChange(state: EditorState, model: TableModel): ChangeSpec | null {
  const changes = alignChanges(model).filter(
    (change) => state.doc.sliceString(change.from, change.to) !== change.insert,
  );
  return changes.length === 0 ? null : changes;
}

/** Realigns the pipes of the table at the cursor. */
export const alignTable: StateCommand = ({ state, dispatch }) => {
  const model = tableAt(state, state.selection.main.head);
  if (!model) {
    return false;
  }
  const change = alignTableChange(state, model);
  if (change) {
    dispatch(
      state.update({
        changes: change,
        selection: state.selection.map(state.changes(change)),
        userEvent: "format.table",
      }),
    );
  }
  return true;
};

function selectCell(model: TableModel, row: number, cell: number): EditorSelection | null {
  const range = cellRange(model, { row, cell });
  return range ? EditorSelection.single(range.from, range.to) : null;
}

/**
 * Moves to the next cell (selecting its content); from the last cell a new
 * empty row is appended and its first cell receives the cursor.
 */
export const nextCell: StateCommand = ({ state, dispatch }) => {
  const head = state.selection.main.head;
  const model = tableAt(state, head);
  if (!model) {
    return false;
  }
  const address = cellAt(model, head);
  if (!address) {
    return false;
  }
  const columns = model.header.cells.length;
  const rows = 1 + model.body.length;
  let { row, cell } = address;
  cell += 1;
  if (cell >= columns) {
    cell = 0;
    row += 1;
  }
  if (row >= rows) {
    const line = emptyRow(model);
    const insert = `\n${line}`;
    const last = model.body[model.body.length - 1] ?? model.delimiter;
    const cursor = model.to + 1 + last.prefix.length + 2;
    dispatch(
      state.update({
        changes: { from: model.to, insert },
        selection: EditorSelection.cursor(cursor),
        scrollIntoView: true,
        userEvent: "input.table",
      }),
    );
    return true;
  }
  const selection = selectCell(model, row, cell) ?? placeInMissingCell(model, row, cell);
  if (!selection) {
    return true;
  }
  dispatch(state.update({ selection, scrollIntoView: true, userEvent: "select" }));
  return true;
};

/** Moves to the previous cell; at the first cell nothing happens. */
export const prevCell: StateCommand = ({ state, dispatch }) => {
  const head = state.selection.main.head;
  const model = tableAt(state, head);
  if (!model) {
    return false;
  }
  const address = cellAt(model, head);
  if (!address) {
    return false;
  }
  let { row, cell } = address;
  cell -= 1;
  if (cell < 0) {
    row -= 1;
    if (row < 0) {
      return true;
    }
    cell = model.header.cells.length - 1;
  }
  const selection = selectCell(model, row, cell) ?? placeInMissingCell(model, row, cell);
  if (!selection) {
    return true;
  }
  dispatch(state.update({ selection, scrollIntoView: true, userEvent: "select" }));
  return true;
};

/**
 * A row may have fewer cells than the header; the cursor then goes to the
 * end of that row so the user can type the missing pipes.
 */
function placeInMissingCell(model: TableModel, row: number, cell: number): EditorSelection | null {
  const target = row === 0 ? model.header : model.body[row - 1];
  if (!target || cell < target.cells.length) {
    return null;
  }
  return EditorSelection.single(target.to);
}
