/**
 * Blockquotes: every line inside a quote gets a left border via a line
 * class; the `>` markers are styled muted. The markers stay visible in both
 * states (styled, not replaced), which keeps the layout stable when the
 * cursor enters or leaves the quote.
 */
import type { NodeVisitor } from "./decorate";
import { livePreviewFamily } from "./decorate";

export const visitBlockquote: NodeVisitor = (ref, state, out) => {
  if (ref.name === "Blockquote") {
    for (let pos = ref.from; pos <= ref.to;) {
      const line = state.doc.lineAt(pos);
      out.line(line.from, "cm-quote-line");
      pos = line.to + 1;
      if (line.to >= ref.to) {
        break;
      }
    }
    return undefined;
  }
  if (ref.name === "QuoteMark") {
    out.mark(ref.from, ref.to, "cm-quote-mark");
    return false;
  }
  return undefined;
};

export const blockquote = livePreviewFamily(visitBlockquote);
