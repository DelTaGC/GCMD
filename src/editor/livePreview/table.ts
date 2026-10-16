/**
 * Tables.
 *
 * Inactive: the whole `Table` node is replaced by one block widget that
 * renders header and body cells with inline formatting. Clicking a cell puts
 * the cursor into that cell's source, which makes the table active.
 *
 * Active: the raw rows show in a monospace font with muted pipes so the
 * columns line up while typing. When the selection leaves a table whose text
 * was edited while it was active, the pipes are realigned by one undoable
 * transaction (`alignTable`); a table that was only visited is left alone.
 * Tab / Shift+Tab move between cells (`commands/table.ts`).
 */
import type { EditorState, Extension } from "@codemirror/state";
import { ViewPlugin, WidgetType, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { runCommand } from "../commands/registry";
import { alignTableChange, tableAt } from "../commands/table";
import { currentDocumentPath } from "../document";
import { isActive } from "./activeBlock";
import {
  blockFamily,
  livePreviewFamily,
  type BlockVisitor,
  type Collector,
  type NodeVisitor,
} from "./decorate";
import { renderInline } from "./inlineDom";
import { cellAt, tableModel, type Align, type TableModel, type TableRow } from "./tableModel";

/** Cell content ready for rendering; offsets are relative to the table start. */
interface CellView {
  readonly offset: number;
  readonly text: string;
}

interface RowView {
  readonly cells: readonly CellView[];
}

export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly aligns: readonly Align[],
    readonly header: RowView,
    readonly body: readonly RowView[],
    readonly documentPath: string | null,
  ) {
    super();
  }

  static fromModel(model: TableModel, source: string, documentPath: string | null): TableWidget {
    const row = (cells: readonly { from: number; text: string }[]): RowView => ({
      cells: cells.map((cell) => ({ offset: cell.from - model.from, text: cell.text })),
    });
    return new TableWidget(
      source,
      model.aligns,
      row(model.header.cells),
      model.body.map((r) => row(r.cells)),
      documentPath,
    );
  }

  override eq(other: TableWidget): boolean {
    return other.source === this.source && other.documentPath === this.documentPath;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-widget";
    const table = document.createElement("table");
    const ctx = {
      documentPath: this.documentPath,
      onLayout: (): void => {
        view.requestMeasure();
      },
    };
    const columns = this.header.cells.length;
    const makeRow = (row: RowView, tag: "th" | "td"): HTMLTableRowElement => {
      const tr = document.createElement("tr");
      for (let c = 0; c < columns; c += 1) {
        const cell = row.cells[c];
        const td = document.createElement(tag);
        const align = this.aligns[c] ?? "none";
        if (align !== "none") {
          td.style.textAlign = align;
        }
        if (cell) {
          td.dataset["offset"] = String(cell.offset);
          renderInline(cell.text, td, ctx);
        } else {
          td.dataset["offset"] = String(row.cells[row.cells.length - 1]?.offset ?? 0);
        }
        tr.append(td);
      }
      return tr;
    };
    const thead = document.createElement("thead");
    thead.append(makeRow(this.header, "th"));
    const tbody = document.createElement("tbody");
    for (const row of this.body) {
      tbody.append(makeRow(row, "td"));
    }
    table.append(thead, tbody);
    const scroller = document.createElement("div");
    scroller.className = "cm-table-scroll";
    scroller.append(table);
    wrapper.append(scroller);
    this.addHandles(view, wrapper, scroller, table);

    wrapper.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-href]") && (event.ctrlKey || event.metaKey)) {
        // Ctrl+click on a link inside a cell is handled by the link opener.
        return;
      }
      event.preventDefault();
      const cell = target?.closest<HTMLElement>("[data-offset]");
      const start = view.posAtDOM(wrapper);
      const offset = Number(cell?.dataset["offset"] ?? "0");
      view.dispatch({
        selection: { anchor: start + offset },
        scrollIntoView: true,
        userEvent: "select.pointer",
      });
      view.focus();
    });
    return wrapper;
  }

  /**
   * (+) handles on every column and row boundary, shown while the mouse is
   * over the widget (CSS), with a guide line on the hovered boundary. They
   * are positioned from measured cell boxes when the pointer enters, so
   * they never affect the widget's layout. A click moves the cursor into
   * the neighbouring cell and runs the matching insert command.
   */
  private addHandles(
    view: EditorView,
    wrapper: HTMLElement,
    scroller: HTMLElement,
    table: HTMLTableElement,
  ): void {
    const columns = this.header.cells.length;
    const rows = 1 + this.body.length;
    const guide = document.createElement("div");
    guide.className = "cm-table-guide";
    wrapper.append(guide);

    interface Layout {
      left: number;
      top: number;
      width: number;
      height: number;
      xs: number[];
      ys: number[];
    }
    let layout: Layout | null = null;
    const handles: { kind: HandleKind; index: number; button: HTMLButtonElement }[] = [];

    const measure = (): Layout => {
      const base = wrapper.getBoundingClientRect();
      const box = table.getBoundingClientRect();
      const xs = [...table.querySelectorAll("thead th")].map(
        (th) => th.getBoundingClientRect().left - base.left,
      );
      xs.push(box.right - base.left);
      const ys = [...table.querySelectorAll("tr")].map(
        (tr) => tr.getBoundingClientRect().top - base.top,
      );
      ys.push(box.bottom - base.top);
      return {
        left: box.left - base.left,
        top: box.top - base.top,
        width: box.width,
        height: box.height,
        xs,
        ys,
      };
    };

    const place = (): void => {
      layout = measure();
      const visibleRight = scroller.clientWidth;
      for (const handle of handles) {
        const { style } = handle.button;
        // Column handles sit just above the top edge, row handles just left
        // of the left edge, so the two at the corner do not overlap.
        if (handle.kind === "column") {
          const x = layout.xs[handle.index] ?? 0;
          style.left = `${String(x)}px`;
          style.top = `${String(layout.top - HANDLE_OFFSET)}px`;
          handle.button.hidden = x > visibleRight;
        } else {
          style.left = `${String(layout.left - HANDLE_OFFSET)}px`;
          style.top = `${String(layout.ys[handle.index] ?? 0)}px`;
        }
      }
    };

    const showGuide = (kind: HandleKind, index: number): void => {
      if (!layout) {
        return;
      }
      const { style } = guide;
      if (kind === "column") {
        style.left = `${String(layout.xs[index] ?? 0)}px`;
        style.top = `${String(layout.top)}px`;
        style.width = "2px";
        style.height = `${String(layout.height)}px`;
      } else {
        style.left = `${String(layout.left)}px`;
        style.top = `${String(layout.ys[index] ?? 0)}px`;
        style.width = `${String(Math.min(layout.width, scroller.clientWidth))}px`;
        style.height = "2px";
      }
      guide.classList.add("cm-table-guide-visible");
    };
    const hideGuide = (): void => {
      guide.classList.remove("cm-table-guide-visible");
    };

    const add = (kind: HandleKind, index: number): void => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cm-table-handle cm-table-handle-${kind}`;
      button.textContent = "+";
      button.tabIndex = -1;
      const title =
        kind === "column"
          ? `Insert column ${index === 0 ? "before column 1" : `after column ${String(index)}`}`
          : `Insert row ${index === 0 ? "above the header" : `after row ${String(index)}`}`;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("mousedown", (event) => {
        // Not a cell click: neither the wrapper nor CodeMirror must see it.
        event.preventDefault();
        event.stopPropagation();
        if (event.button === 0) {
          this.insertAt(view, wrapper, kind, index);
        }
      });
      button.addEventListener("mouseenter", () => {
        showGuide(kind, index);
      });
      button.addEventListener("mouseleave", hideGuide);
      wrapper.append(button);
      handles.push({ kind, index, button });
    };
    for (let c = 0; c <= columns; c += 1) {
      add("column", c);
    }
    for (let r = 0; r <= rows; r += 1) {
      add("row", r);
    }
    wrapper.addEventListener("mouseenter", place);
    scroller.addEventListener("scroll", place);
  }

  /** Puts the cursor next to the boundary and runs the insert command. */
  private insertAt(view: EditorView, wrapper: HTMLElement, kind: HandleKind, index: number): void {
    const start = view.posAtDOM(wrapper);
    let cell: CellView | undefined;
    let command: string;
    if (kind === "column") {
      const columns = this.header.cells.length;
      cell = this.header.cells[index === 0 ? 0 : Math.min(index, columns) - 1];
      command = index === 0 ? "table.insertColumnLeft" : "table.insertColumnRight";
    } else {
      const row = index === 0 ? 0 : index - 1;
      const target = row === 0 ? this.header : this.body[row - 1];
      cell = target?.cells[0];
      command = index === 0 ? "table.insertRowAbove" : "table.insertRowBelow";
    }
    view.dispatch({
      selection: { anchor: start + (cell?.offset ?? 0) },
      scrollIntoView: true,
      userEvent: "select.pointer",
    });
    view.focus();
    runCommand(command, view);
  }

  override ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }
}

type HandleKind = "column" | "row";

/** Distance (px) between a handle's centre and the table edge it sits on. */
const HANDLE_OFFSET = 9;

/**
 * The slot of cell number `cell` in `row`: from the character after the
 * pipe that opens it to the pipe that closes it, padding included, so an
 * empty cell still has a range to highlight. Null when the slot is empty.
 */
export function cellSlot(
  row: TableRow,
  cell: number,
  state: EditorState,
): { from: number; to: number } | null {
  const target = row.cells[cell];
  if (!target) {
    return null;
  }
  const previous = row.cells[cell - 1];
  let from: number;
  if (previous) {
    from = previous.end + 1;
  } else {
    const opensWithPipe = state.doc.sliceString(row.from, row.from + 1) === "|";
    from = opensWithPipe ? row.from + 1 : row.from;
  }
  return from < target.end ? { from, to: target.end } : null;
}

/**
 * Marks the cell under the main cursor and, for a body cell, its header
 * cell, so the column reads at a glance while the raw rows are shown.
 */
function markActiveCell(model: TableModel, state: EditorState, out: Collector): void {
  const head = state.selection.main.head;
  const delimiter = model.delimiter;
  if (head >= delimiter.from - delimiter.prefix.length && head <= delimiter.to) {
    return;
  }
  const address = cellAt(model, head);
  if (!address) {
    return;
  }
  const row = address.row === 0 ? model.header : model.body[address.row - 1];
  const slot = row ? cellSlot(row, address.cell, state) : null;
  if (slot) {
    out.mark(slot.from, slot.to, "cm-table-cell-active");
  }
  if (address.row > 0) {
    const header = cellSlot(model.header, address.cell, state);
    if (header) {
      out.mark(header.from, header.to, "cm-table-header-active");
    }
  }
}

/**
 * Raw mode, only while the table is active: monospace rows, pipes drawn as
 * thin column rules, the delimiter row muted, the active cell highlighted.
 */
export const visitTable: NodeVisitor = (ref, state, out) => {
  if (ref.name === "Table") {
    if (!isActive(state, ref.from, ref.to)) {
      return false;
    }
    const first = state.doc.lineAt(ref.from);
    const last = state.doc.lineAt(ref.to);
    for (let n = first.number; n <= last.number; n += 1) {
      out.line(state.doc.line(n).from, "cm-table-line");
    }
    const model = tableModel(state, ref.node);
    if (model) {
      markActiveCell(model, state, out);
    }
    return undefined;
  }
  if (ref.name === "TableDelimiter") {
    // Single pipes become column rules; the delimiter row is one node.
    const pipe = ref.to - ref.from === 1;
    out.mark(ref.from, ref.to, pipe ? "cm-table-delimiter cm-table-pipe" : "cm-table-delimiter");
    return false;
  }
  return undefined;
};

export const visitTableBlocks: BlockVisitor = (ref: SyntaxNodeRef, state, blocks) => {
  if (ref.name !== "Table") {
    return undefined;
  }
  const model = tableModel(state, ref.node);
  if (model) {
    const source = state.doc.sliceString(model.from, model.to);
    blocks.push({
      from: model.from,
      to: model.to,
      widget: TableWidget.fromModel(model, source, currentDocumentPath(state)),
    });
  }
  return false;
};

/**
 * Realigns a table when the selection leaves it after an edit. Runs after
 * the update that moved the selection, as its own undoable transaction.
 */
const alignOnExit = ViewPlugin.fromClass(
  class {
    private current: TableModel | null;
    private edited = false;

    constructor(view: EditorView) {
      this.current = tableAt(view.state, view.state.selection.main.head);
    }

    update(update: ViewUpdate): void {
      const previous = this.current;
      if (
        previous &&
        update.docChanged &&
        update.changes.touchesRange(previous.from, previous.to)
      ) {
        this.edited = true;
      }
      const head = update.state.selection.main.head;
      const next = tableAt(update.state, head);
      const previousFrom = previous ? update.changes.mapPos(previous.from) : -1;
      if (next?.from === previousFrom) {
        this.current = next;
        return;
      }
      // Left the previous table (or the document has no table at the cursor).
      const left = previous && this.edited ? tableAt(update.state, previousFrom) : null;
      this.current = next;
      this.edited = false;
      if (left) {
        const change = alignTableChange(update.state, left);
        if (change) {
          const view = update.view;
          queueMicrotask(() => {
            // The tree may have moved on; re-resolve the table at that position.
            const fresh = tableAt(view.state, left.from);
            const spec = fresh ? alignTableChange(view.state, fresh) : null;
            if (spec) {
              view.dispatch({ changes: spec, userEvent: "format.table" });
            }
          });
        }
      }
    }
  },
);

export const table: Extension = [
  livePreviewFamily(visitTable),
  blockFamily(visitTableBlocks),
  alignOnExit,
];
