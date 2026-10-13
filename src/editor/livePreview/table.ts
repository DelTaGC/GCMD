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
import type { Extension } from "@codemirror/state";
import { ViewPlugin, WidgetType, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { alignTableChange, tableAt } from "../commands/table";
import { currentDocumentPath } from "../document";
import { isActive } from "./activeBlock";
import { blockFamily, livePreviewFamily, type BlockVisitor, type NodeVisitor } from "./decorate";
import { renderInline } from "./inlineDom";
import { tableModel, type Align, type TableModel } from "./tableModel";

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
    wrapper.append(table);

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

  override ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }
}

/** Raw mode: monospace rows and muted pipes, only while the table is active. */
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
    return undefined;
  }
  if (ref.name === "TableDelimiter") {
    out.mark(ref.from, ref.to, "cm-table-delimiter");
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
