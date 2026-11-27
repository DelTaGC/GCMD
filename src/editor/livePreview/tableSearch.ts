/**
 * Search matches in rendered tables. The search highlighter cannot reach into
 * a block widget, so every cell whose source contains a match is tinted as a
 * whole. That includes matches in markup the cell does not show, such as a
 * link URL. An active table is raw text and highlighted as usual.
 *
 * Only a class on existing cells changes, so searching never rebuilds a table.
 * The tint is screen-only (`theme/editor.css`).
 */
import { getSearchQuery, searchPanelOpen } from "@codemirror/search";
import type { EditorState, Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { tableAt } from "../commands/table";
import type { TableModel } from "./tableModel";

const CLASS = "cm-table-match";

function isSearching(state: EditorState): boolean {
  return searchPanelOpen(state) && getSearchQuery(state).valid;
}

/**
 * Which cells of `model` hold a match of the open search: one entry per row
 * (header first, no delimiter row), one flag per cell written in that row.
 */
export function matchedCells(state: EditorState, model: TableModel): boolean[][] {
  const rows = [model.header, ...model.body];
  const matched = rows.map((row) => row.cells.map(() => false));
  if (!isSearching(state)) {
    return matched;
  }
  const cursor = getSearchQuery(state).getCursor(state, model.from, model.to);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    const { from, to } = next.value;
    rows.forEach((row, r) => {
      row.cells.forEach((cell, c) => {
        const flags = matched[r];
        if (flags && from < cell.to && to > cell.from) {
          flags[c] = true;
        }
      });
    });
  }
  return matched;
}

interface Paint {
  readonly cell: Element;
  readonly matched: boolean;
}

function readPaint(view: EditorView): Paint[] {
  const paint: Paint[] = [];
  for (const widget of view.contentDOM.querySelectorAll<HTMLElement>(".cm-table-widget")) {
    const model = tableAt(view.state, view.posAtDOM(widget));
    if (!model) {
      continue;
    }
    const matched = matchedCells(view.state, model);
    widget.querySelectorAll("tr").forEach((tr, r) => {
      Array.from(tr.cells).forEach((cell, c) => {
        paint.push({ cell, matched: matched[r]?.[c] ?? false });
      });
    });
  }
  return paint;
}

export const tableSearch: Extension = ViewPlugin.fromClass(
  class {
    /** Whether cells may still carry the class and need one more pass. */
    private painted = false;

    constructor(private readonly view: EditorView) {
      this.schedule();
    }

    update(): void {
      this.schedule();
    }

    /** Paints after CodeMirror has drawn the widgets of this update. */
    private schedule(): void {
      const searching = isSearching(this.view.state);
      if (!searching && !this.painted) {
        return;
      }
      this.painted = searching;
      this.view.requestMeasure({
        key: this,
        read: readPaint,
        write: (paint) => {
          for (const { cell, matched } of paint) {
            cell.classList.toggle(CLASS, matched);
          }
        },
      });
    }
  },
);
