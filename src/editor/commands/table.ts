/**
 * Table commands: cell navigation (Tab / Shift+Tab / Enter), alignment, and
 * the structural edits (rows, columns, column alignment).
 *
 * Structural edits go through the grid (`tableModel.ts`): the table is
 * rebuilt from its cell texts and written back aligned in one undoable
 * transaction, with the cursor placed in the cell that makes sense next.
 *
 * `alignTableChange` is also used by the live-preview table family to
 * realign a table when the selection leaves it after an edit.
 */
import { isolateHistory } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type StateCommand,
  type Transaction,
} from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  alignChanges,
  cellAt,
  cellRange,
  columnWidths,
  emptyRow,
  formatGrid,
  gridOf,
  tableModel,
  type Align,
  type CellAddress,
  type Grid,
  type GridRow,
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
    dispatch(appendRow(state, model, 0));
    return true;
  }
  const selection = selectCell(model, row, cell) ?? placeInMissingCell(model, row, cell);
  if (!selection) {
    return true;
  }
  dispatch(state.update({ selection, scrollIntoView: true, userEvent: "select" }));
  return true;
};

/** Appends an empty row and puts the cursor in its cell number `cell`. */
function appendRow(state: EditorState, model: TableModel, cell: number): Transaction {
  const last = model.body[model.body.length - 1] ?? model.delimiter;
  const widths = columnWidths(model);
  // `| ` then each earlier cell's padding and its ` | ` separator.
  const column = widths.slice(0, cell).reduce((sum, width) => sum + width + 3, 2);
  const cursor = model.to + 1 + last.prefix.length + column;
  return state.update({
    changes: { from: model.to, insert: `\n${emptyRow(model)}` },
    selection: EditorSelection.cursor(cursor),
    scrollIntoView: true,
    userEvent: "input.table",
  });
}

/**
 * Enter inside a table: moves to the same column of the next row (header ->
 * first body row), selecting its content; from the last row a new empty row
 * is appended. Never splits a row.
 */
export const nextRow: StateCommand = ({ state, dispatch }) => {
  const head = state.selection.main.head;
  const model = tableAt(state, head);
  if (!model) {
    return false;
  }
  const address = cellAt(model, head);
  if (!address) {
    return false;
  }
  const row = address.row + 1;
  if (row > model.body.length) {
    dispatch(appendRow(state, model, address.cell));
    return true;
  }
  const selection =
    selectCell(model, row, address.cell) ?? placeInMissingCell(model, row, address.cell);
  if (selection) {
    dispatch(state.update({ selection, scrollIntoView: true, userEvent: "select" }));
  }
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

// ---------------------------------------------------------------------------
// Structural edits

/** Where the cursor goes after a grid edit: a cell (row 0 = header) and an offset in it. */
interface GridCursor extends CellAddress {
  readonly offset: number;
}

interface GridEdit {
  readonly grid: Grid;
  readonly cursor: GridCursor;
}

/**
 * Computes the edited grid from the current one, the cell at the cursor and
 * the cursor's offset inside that cell; `null` when there is nothing to do.
 */
type GridEditor = (grid: Grid, at: CellAddress, offset: number) => GridEdit | null;

/**
 * A command that rewrites the table at the cursor from an edited grid. The
 * whole table is replaced by its aligned source in one transaction; the
 * cursor lands in `edit.cursor`, clamped to that cell's content.
 */
function gridCommand(edit: GridEditor): StateCommand {
  return ({ state, dispatch }) => {
    const head = state.selection.main.head;
    const model = tableAt(state, head);
    if (!model) {
      return false;
    }
    const address = cellAt(model, head);
    if (!address) {
      return false;
    }
    const current = cellRange(model, address);
    const offset = current ? Math.max(0, Math.min(head - current.from, current.text.length)) : 0;
    const result = edit(gridOf(model), address, offset);
    if (!result) {
      return true;
    }
    const layout = formatGrid(result.grid);
    if (layout.text === state.doc.sliceString(model.from, model.to)) {
      return true;
    }
    const { row, cell } = result.cursor;
    const gridRow = row === 0 ? result.grid.header : result.grid.body[row - 1];
    const text = gridRow?.cells[cell] ?? "";
    const start = model.from + (layout.cells[row]?.[cell] ?? 0);
    const pos = start + Math.min(result.cursor.offset, text.length);
    dispatch(
      state.update({
        changes: { from: model.from, to: model.to, insert: layout.text },
        selection: EditorSelection.cursor(pos),
        scrollIntoView: true,
        userEvent: "input.table",
        // One undo step per structural edit, never merged with nearby typing.
        annotations: isolateHistory.of("full"),
      }),
    );
    return true;
  };
}

function blankRow(prefix: string, columns: number): GridRow {
  return { prefix, cells: Array.from({ length: columns }, () => "") };
}

function spliceAll<T>(items: readonly T[], index: number, remove: number, ...insert: T[]): T[] {
  const copy = [...items];
  copy.splice(index, remove, ...insert);
  return copy;
}

/** Applies `fn` to the header and every body row. */
function mapRows(grid: Grid, fn: (cells: readonly string[]) => string[]): Grid {
  return {
    ...grid,
    header: { ...grid.header, cells: fn(grid.header.cells) },
    body: grid.body.map((row) => ({ ...row, cells: fn(row.cells) })),
  };
}

/** Inserts an empty body row at `index`, with the prefix of the row it displaces (or the last one). */
function insertBodyRow(grid: Grid, index: number): Grid {
  const columns = grid.header.cells.length;
  const neighbour = grid.body[index] ?? grid.body[grid.body.length - 1];
  const prefix = neighbour?.prefix ?? grid.delimiterPrefix;
  return { ...grid, body: spliceAll(grid.body, index, 0, blankRow(prefix, columns)) };
}

/**
 * Inserts an empty row above the current one. On the header the new row
 * becomes the header and the old header the first body row.
 */
export const insertRowAbove: StateCommand = gridCommand((grid, at) => {
  if (at.row === 0) {
    const columns = grid.header.cells.length;
    const old: GridRow = { prefix: grid.delimiterPrefix, cells: grid.header.cells };
    return {
      grid: { ...grid, header: blankRow(grid.header.prefix, columns), body: [old, ...grid.body] },
      cursor: { row: 0, cell: at.cell, offset: 0 },
    };
  }
  return {
    grid: insertBodyRow(grid, at.row - 1),
    cursor: { row: at.row, cell: at.cell, offset: 0 },
  };
});

/** Inserts an empty row below the current one (below the header: the first body row). */
export const insertRowBelow: StateCommand = gridCommand((grid, at) => ({
  grid: insertBodyRow(grid, at.row),
  cursor: { row: at.row + 1, cell: at.cell, offset: 0 },
}));

/**
 * Deletes the current row. Deleting the header promotes the first body row;
 * a table reduced to its header keeps header and delimiter. A table that is
 * only a header is removed entirely (see `deleteRow`).
 */
const deleteGridRow: StateCommand = gridCommand((grid, at) => {
  if (at.row === 0) {
    const [first, ...rest] = grid.body;
    if (!first) {
      return null;
    }
    return {
      grid: { ...grid, header: { prefix: grid.header.prefix, cells: first.cells }, body: rest },
      cursor: { row: 0, cell: at.cell, offset: 0 },
    };
  }
  const body = spliceAll(grid.body, at.row - 1, 1);
  return {
    grid: { ...grid, body },
    cursor: { row: Math.min(at.row, body.length), cell: at.cell, offset: 0 },
  };
});

export const deleteRow: StateCommand = (target) => {
  const { state, dispatch } = target;
  const model = tableAt(state, state.selection.main.head);
  if (!model) {
    return false;
  }
  if (model.body.length > 0) {
    return deleteGridRow(target);
  }
  // Only a header is left: remove the table's lines (and the break before them).
  const first = state.doc.lineAt(model.from);
  const from = first.number > 1 ? first.from - 1 : first.from;
  dispatch(
    state.update({
      changes: { from, to: model.to },
      selection: EditorSelection.cursor(from),
      scrollIntoView: true,
      userEvent: "input.table",
      annotations: isolateHistory.of("full"),
    }),
  );
  return true;
};

function insertColumn(grid: Grid, index: number): Grid {
  const columns = grid.header.cells.length;
  const at = Math.min(index, columns);
  return {
    ...mapRows(grid, (cells) => spliceAll(cells, at, 0, "")),
    aligns: spliceAll(grid.aligns, at, 0, "none"),
  };
}

export const insertColumnLeft: StateCommand = gridCommand((grid, at) => ({
  grid: insertColumn(grid, at.cell),
  cursor: { row: at.row, cell: at.cell, offset: 0 },
}));

export const insertColumnRight: StateCommand = gridCommand((grid, at) => ({
  grid: insertColumn(grid, at.cell + 1),
  cursor: { row: at.row, cell: at.cell + 1, offset: 0 },
}));

/** Deletes the current column; the last column of a table cannot be deleted. */
export const deleteColumn: StateCommand = gridCommand((grid, at) => {
  const columns = grid.header.cells.length;
  if (columns <= 1 || at.cell >= columns) {
    return null;
  }
  return {
    grid: {
      ...mapRows(grid, (cells) => spliceAll(cells, at.cell, 1)),
      aligns: spliceAll(grid.aligns, at.cell, 1),
    },
    cursor: { row: at.row, cell: Math.min(at.cell, columns - 2), offset: 0 },
  };
});

function moveColumn(direction: -1 | 1): StateCommand {
  return gridCommand((grid, at, offset) => {
    const columns = grid.header.cells.length;
    const target = at.cell + direction;
    if (target < 0 || target >= columns || at.cell >= columns) {
      return null;
    }
    const swap = <T>(items: readonly T[], fill: T): T[] => {
      const copy = [...items];
      while (copy.length < columns) {
        copy.push(fill);
      }
      const moved = copy[at.cell] ?? fill;
      copy[at.cell] = copy[target] ?? fill;
      copy[target] = moved;
      return copy;
    };
    return {
      grid: { ...mapRows(grid, (cells) => swap(cells, "")), aligns: swap(grid.aligns, "none") },
      cursor: { row: at.row, cell: target, offset },
    };
  });
}

export const moveColumnLeft: StateCommand = moveColumn(-1);
export const moveColumnRight: StateCommand = moveColumn(1);

/** Sets the alignment of the current column (rewrites the delimiter row). */
export function alignColumn(align: Align): StateCommand {
  return gridCommand((grid, at, offset) => {
    const aligns = [...grid.aligns];
    while (aligns.length <= at.cell) {
      aligns.push("none");
    }
    aligns[at.cell] = align;
    return { grid: { ...grid, aligns }, cursor: { row: at.row, cell: at.cell, offset } };
  });
}

/** The alignment of the column at the cursor, or null outside a table. */
export function columnAlignAt(state: EditorState): Align | null {
  const head = state.selection.main.head;
  const model = tableAt(state, head);
  const address = model ? cellAt(model, head) : null;
  if (!model || !address) {
    return null;
  }
  return model.aligns[address.cell] ?? "none";
}
