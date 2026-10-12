/**
 * Tables, phase 2 placeholder: table lines are set in a monospace font so
 * the pipes line up, and delimiters are muted. The rendered widget, raw
 * mode on entry, cell navigation and align-on-exit arrive in phase 3.
 */
import { livePreviewFamily, type NodeVisitor } from "./decorate";

export const visitTable: NodeVisitor = (ref, state, out) => {
  if (ref.name === "Table") {
    const first = state.doc.lineAt(ref.from);
    const last = state.doc.lineAt(ref.to);
    for (let n = first.number; n <= last.number; n += 1) {
      out.line(state.doc.line(n).from, "cm-table-line");
    }
    return undefined;
  }
  if (ref.name === "TableDelimiter") {
    out.mark(ref.from, ref.to, "cm-mark");
    return false;
  }
  return undefined;
};

export const table = livePreviewFamily(visitTable);
