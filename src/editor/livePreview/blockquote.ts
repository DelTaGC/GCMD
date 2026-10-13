/**
 * Blockquotes: every line inside a quote gets a left border via a line
 * class. The `>` markers (and the single space after them) are hidden when
 * the line is not active and shown in the markup color when it is.
 */
import { isActive } from "./activeBlock";
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
    if (isActive(state, ref.from, ref.to)) {
      out.mark(ref.from, ref.to, "cm-mark");
    } else {
      const next = state.doc.sliceString(ref.to, ref.to + 1);
      out.hide(ref.from, next === " " ? ref.to + 1 : ref.to);
    }
    return false;
  }
  return undefined;
};

export const blockquote = livePreviewFamily(visitBlockquote);
