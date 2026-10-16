/**
 * Pure model of a GFM table: rows, cells with document positions, column
 * alignment, and the aligned (pretty-printed) source. No DOM, no view.
 *
 * Rows come from the Lezer `Table` node (`TableHeader`, the delimiter row and
 * `TableRow` children) but cells are split from the row text here, because
 * Lezer emits no node for an empty cell and we need every column position for
 * Tab navigation and alignment. Each row keeps its `prefix`: the text before
 * the row on its line (list indentation, `> ` quote marks), which is written
 * back unchanged when the table is realigned.
 */
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export type Align = "left" | "center" | "right" | "none";

export interface TableCell {
  /** Document position of the trimmed cell content. */
  readonly from: number;
  readonly to: number;
  /** Position of the pipe closing the cell (or the row end without one). */
  readonly end: number;
  /** Trimmed raw markdown of the cell (`\|` escapes kept). */
  readonly text: string;
}

export type RowKind = "header" | "delimiter" | "body";

export interface TableRow {
  readonly kind: RowKind;
  /** Document position where the row content starts (first pipe or cell). */
  readonly from: number;
  /** End of the row's line. */
  readonly to: number;
  /** Text on the line before `from`. */
  readonly prefix: string;
  readonly cells: readonly TableCell[];
}

export interface TableModel {
  /** Start of the header row content; same as the Lezer node's `from`. */
  readonly from: number;
  /** End of the last row's line. */
  readonly to: number;
  readonly aligns: readonly Align[];
  readonly header: TableRow;
  readonly delimiter: TableRow;
  readonly body: readonly TableRow[];
}

const ROW_NODES = new Set<string>(["TableHeader", "TableDelimiter", "TableRow"]);

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

interface RelativeCell {
  from: number;
  to: number;
  end: number;
  text: string;
}

/** Splits one row's text into trimmed cells with offsets relative to the text. */
export function splitCells(text: string): RelativeCell[] {
  const cells: RelativeCell[] = [];
  const push = (start: number, end: number): void => {
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    const from = start + leading;
    cells.push({ from, to: from + trimmed.length, end, text: trimmed });
  };
  let start = 0;
  const trimmedStart = text.length - text.trimStart().length;
  if (text[trimmedStart] === "|") {
    start = trimmedStart + 1;
  }
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "|" && !isEscaped(text, i)) {
      push(start, i);
      start = i + 1;
    }
  }
  if (text.slice(start).trim() !== "") {
    push(start, text.length);
  }
  return cells;
}

function alignOf(delimiter: string): Align {
  const left = delimiter.startsWith(":");
  const right = delimiter.endsWith(":") && delimiter.length > 1;
  if (left && right) {
    return "center";
  }
  if (left) {
    return "left";
  }
  if (right) {
    return "right";
  }
  return "none";
}

function rowOf(state: EditorState, node: SyntaxNode, kind: RowKind): TableRow {
  const line = state.doc.lineAt(node.from);
  const offset = node.from - line.from;
  const prefix = line.text.slice(0, offset);
  const text = line.text.slice(offset);
  const cells = splitCells(text).map((cell) => ({
    from: node.from + cell.from,
    to: node.from + cell.to,
    end: node.from + cell.end,
    text: cell.text,
  }));
  return { kind, from: node.from, to: line.to, prefix, cells };
}

/** Builds the model of a Lezer `Table` node; `null` if the node is malformed. */
export function tableModel(state: EditorState, table: SyntaxNode): TableModel | null {
  let header: TableRow | null = null;
  let delimiter: TableRow | null = null;
  const body: TableRow[] = [];
  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (!ROW_NODES.has(child.name)) {
      continue;
    }
    if (child.name === "TableHeader") {
      header = rowOf(state, child, "header");
    } else if (child.name === "TableDelimiter") {
      delimiter = rowOf(state, child, "delimiter");
    } else {
      body.push(rowOf(state, child, "body"));
    }
  }
  if (!header || !delimiter) {
    return null;
  }
  const aligns = delimiter.cells.map((cell) => alignOf(cell.text));
  const last = body[body.length - 1] ?? delimiter;
  return { from: table.from, to: last.to, aligns, header, delimiter, body };
}

/** All rows in document order (header, delimiter, body). */
export function allRows(model: TableModel): TableRow[] {
  return [model.header, model.delimiter, ...model.body];
}

// ---------------------------------------------------------------------------
// Alignment

/**
 * Approximate terminal-style display width: East Asian wide characters and
 * most emoji count double, combining marks count zero.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) {
      continue;
    }
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    width += wide ? 2 : 1;
  }
  return width;
}

function pad(text: string, width: number, align: Align): string {
  const gap = Math.max(0, width - displayWidth(text));
  switch (align) {
    case "right":
      return " ".repeat(gap) + text;
    case "center": {
      const left = Math.floor(gap / 2);
      return " ".repeat(left) + text + " ".repeat(gap - left);
    }
    default:
      return text + " ".repeat(gap);
  }
}

function delimiterCell(width: number, align: Align): string {
  switch (align) {
    case "left":
      return `:${"-".repeat(width - 1)}`;
    case "right":
      return `${"-".repeat(width - 1)}:`;
    case "center":
      return `:${"-".repeat(width - 2)}:`;
    default:
      return "-".repeat(width);
  }
}

/** Widths of `columns` columns over rows of cell texts (at least 3, so delimiters fit). */
function widthsOf(columns: number, rows: readonly (readonly string[])[]): number[] {
  const widths: number[] = Array.from({ length: columns }, () => 3);
  for (const row of rows) {
    row.forEach((text, index) => {
      if (index < columns) {
        widths[index] = Math.max(widths[index] ?? 3, displayWidth(text));
      }
    });
  }
  return widths;
}

/** Column widths of the aligned table (at least 3, so delimiters fit). */
export function columnWidths(model: TableModel): number[] {
  return widthsOf(
    model.header.cells.length,
    [model.header, ...model.body].map((row) => row.cells.map((cell) => cell.text)),
  );
}

interface RowLayout {
  readonly line: string;
  /** Offset in `line` of each cell's content (empty for the delimiter row). */
  readonly starts: readonly number[];
}

function layoutRow(
  prefix: string,
  kind: RowKind,
  cells: readonly string[],
  widths: readonly number[],
  aligns: readonly Align[],
): RowLayout {
  const columns = widths.length;
  const starts: number[] = [];
  let line = `${prefix}|`;
  for (let c = 0; c < columns; c += 1) {
    const width = widths[c] ?? 3;
    const align = aligns[c] ?? "none";
    line += " ";
    if (kind === "delimiter") {
      line += delimiterCell(width, align);
    } else {
      const text = cells[c] ?? "";
      const padded = pad(text, width, align);
      starts.push(line.length + padded.indexOf(text));
      line += padded;
    }
    line += " |";
  }
  // Cells beyond the header width are not part of the GFM table but must
  // never be lost; they are appended as they were.
  for (const extra of cells.slice(columns)) {
    starts.push(line.length + 1);
    line += ` ${extra} |`;
  }
  return { line, starts };
}

function formatRow(row: TableRow, widths: readonly number[], aligns: readonly Align[]): string {
  return layoutRow(
    row.prefix,
    row.kind,
    row.cells.map((cell) => cell.text),
    widths,
    aligns,
  ).line;
}

/**
 * The aligned source of the table, one string per row, without the first
 * row's prefix (it lies before `model.from` and is not rewritten).
 */
export function formatTable(model: TableModel): string {
  return formatGrid(gridOf(model)).text;
}

// ---------------------------------------------------------------------------
// Grid: the table as plain cell texts, what the structural commands edit

export interface GridRow {
  readonly prefix: string;
  readonly cells: readonly string[];
}

export interface Grid {
  readonly aligns: readonly Align[];
  readonly header: GridRow;
  /** Prefix of the delimiter row, used for rows inserted right after it. */
  readonly delimiterPrefix: string;
  readonly body: readonly GridRow[];
}

/**
 * The model as a grid. Rows shorter than the header are padded with empty
 * cells; cells beyond the header width are kept.
 */
export function gridOf(model: TableModel): Grid {
  const columns = model.header.cells.length;
  const row = (source: TableRow): GridRow => {
    const cells = source.cells.map((cell) => cell.text);
    while (cells.length < columns) {
      cells.push("");
    }
    return { prefix: source.prefix, cells };
  };
  return {
    aligns: [...model.aligns],
    header: row(model.header),
    delimiterPrefix: model.delimiter.prefix,
    body: model.body.map(row),
  };
}

export interface GridLayout {
  /** The aligned source, without the header row's prefix (see `formatTable`). */
  readonly text: string;
  /** Offset in `text` of each cell's content: `cells[0]` is the header, then the body rows. */
  readonly cells: readonly (readonly number[])[];
}

/** Formats a grid; the offsets let a command place the cursor in a cell. */
export function formatGrid(grid: Grid): GridLayout {
  const columns = grid.header.cells.length;
  const widths = widthsOf(columns, [grid.header.cells, ...grid.body.map((row) => row.cells)]);
  const lines: string[] = [];
  const cells: number[][] = [];
  let offset = 0;
  const push = (layout: RowLayout, drop: number): void => {
    const line = layout.line.slice(drop);
    cells.push(layout.starts.map((start) => offset + start - drop));
    lines.push(line);
    offset += line.length + 1;
  };
  const header = grid.header;
  push(layoutRow(header.prefix, "header", header.cells, widths, grid.aligns), header.prefix.length);
  const delimiter = layoutRow(grid.delimiterPrefix, "delimiter", [], widths, grid.aligns);
  lines.push(delimiter.line);
  offset += delimiter.line.length + 1;
  for (const row of grid.body) {
    push(layoutRow(row.prefix, "body", row.cells, widths, grid.aligns), 0);
  }
  return { text: lines.join("\n"), cells };
}

export interface TextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

function padding(text: string, width: number, align: Align): { before: string; after: string } {
  const padded = pad(text, width, align);
  const start = padded.indexOf(text);
  return { before: padded.slice(0, start), after: padded.slice(start + text.length) };
}

/**
 * The same result as `formatTable`, expressed as replacements of the text
 * between cells only (cell contents are never touched), plus a rewrite of
 * the delimiter row. Applying them to the document yields `formatTable`.
 */
export function alignChanges(model: TableModel): TextChange[] {
  const widths = columnWidths(model);
  const columns = widths.length;
  const changes: TextChange[] = [];
  for (const row of allRows(model)) {
    if (row.kind === "delimiter" || row.cells.length === 0) {
      const line = formatRow(row, widths, model.aligns);
      changes.push({ from: row.from, to: row.to, insert: line.slice(row.prefix.length) });
      continue;
    }
    const pads = row.cells.map((cell, c) =>
      c < columns
        ? padding(cell.text, widths[c] ?? 3, model.aligns[c] ?? "none")
        : { before: "", after: "" },
    );
    let gapFrom = row.from;
    row.cells.forEach((cell, c) => {
      const before = pads[c]?.before ?? "";
      const gap = c === 0 ? `| ${before}` : `${pads[c - 1]?.after ?? ""} | ${before}`;
      changes.push({ from: gapFrom, to: cell.from, insert: gap });
      gapFrom = cell.to;
    });
    const last = row.cells.length - 1;
    let tail = `${pads[last]?.after ?? ""} |`;
    for (let c = row.cells.length; c < columns; c += 1) {
      tail += ` ${" ".repeat(widths[c] ?? 3)} |`;
    }
    changes.push({ from: gapFrom, to: row.to, insert: tail });
  }
  return changes;
}

/** Source of a new empty body row, with the prefix of the last row. */
export function emptyRow(model: TableModel): string {
  const widths = columnWidths(model);
  const last = model.body[model.body.length - 1] ?? model.delimiter;
  return `${last.prefix}| ${widths.map((w) => " ".repeat(w)).join(" | ")} |`;
}

/** Index of the cell (in `allRows` order, delimiter row skipped) at `pos`. */
export interface CellAddress {
  readonly row: number;
  readonly cell: number;
}

/**
 * Finds the navigable cell containing `pos`: header cells, then body cells,
 * never the delimiter row. A cell extends up to and including the pipe that
 * closes it, so the padding after a pipe belongs to the next cell. On the
 * delimiter row the last header cell is chosen (see below).
 */
export function cellAt(model: TableModel, pos: number): CellAddress | null {
  const rows = [model.header, ...model.body];
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || pos < row.from - row.prefix.length || pos > row.to) {
      continue;
    }
    const cells = row.cells;
    for (let c = 0; c < cells.length; c += 1) {
      const cell = cells[c];
      if (cell && pos <= cell.end) {
        return { row: r, cell: c };
      }
    }
    return cells.length > 0 ? { row: r, cell: cells.length - 1 } : null;
  }
  if (pos >= model.delimiter.from - model.delimiter.prefix.length && pos <= model.delimiter.to) {
    // On the delimiter row: "current" is the last header cell so that Tab
    // goes to the first body cell and Shift+Tab to the last header cell.
    return { row: 0, cell: Math.max(0, model.header.cells.length - 1) };
  }
  return null;
}

/** The navigable cell at `address`, if it exists. */
export function cellRange(model: TableModel, address: CellAddress): TableCell | null {
  const row = address.row === 0 ? model.header : model.body[address.row - 1];
  return row?.cells[address.cell] ?? null;
}
