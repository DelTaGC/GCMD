/**
 * Headings: ATX (`# Title`) and setext (`Title\n====`).
 *
 * The heading line gets a size class. When the line is not active the ATX
 * markers and the space after them are hidden. Setext underlines stay
 * visible but muted: hiding a whole line would leave a blank gap.
 */
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { isActive } from "./activeBlock";
import { livePreviewFamily, type Collector, type NodeVisitor } from "./decorate";

const ATX = /^ATXHeading([1-6])$/;
const SETEXT = /^SetextHeading([12])$/;

function hideAtxMarks(node: SyntaxNode, state: EditorState, out: Collector): void {
  for (const mark of node.getChildren("HeaderMark")) {
    const isOpening = mark.from === node.from;
    if (isOpening) {
      // Hide the `#` run and the single space that follows it.
      const next = state.doc.sliceString(mark.to, mark.to + 1);
      out.hide(mark.from, next === " " || next === "\t" ? mark.to + 1 : mark.to);
    } else {
      // Closing sequence: hide the preceding spaces too.
      let from = mark.from;
      while (from > node.from && state.doc.sliceString(from - 1, from) === " ") {
        from -= 1;
      }
      out.hide(from, mark.to);
    }
  }
}

export const visitHeadings: NodeVisitor = (ref: SyntaxNodeRef, state, out) => {
  const atx = ATX.exec(ref.name);
  if (atx) {
    const level = atx[1] ?? "1";
    out.line(ref.from, `cm-heading cm-heading-${level}`);
    if (isActive(state, ref.from, ref.to)) {
      for (const mark of ref.node.getChildren("HeaderMark")) {
        out.mark(mark.from, mark.to, "cm-mark");
      }
    } else {
      hideAtxMarks(ref.node, state, out);
    }
    return false;
  }
  const setext = SETEXT.exec(ref.name);
  if (setext) {
    const level = setext[1] ?? "1";
    const node = ref.node;
    const underline = node.getChild("HeaderMark");
    const textEnd = underline ? state.doc.lineAt(underline.from).from - 1 : ref.to;
    for (let pos = ref.from; pos <= textEnd;) {
      const line = state.doc.lineAt(pos);
      out.line(line.from, `cm-heading cm-heading-${level}`);
      pos = line.to + 1;
    }
    if (underline) {
      out.line(underline.from, "cm-setext-underline");
      out.mark(underline.from, underline.to, "cm-mark");
    }
    return false;
  }
  return undefined;
};

export const headings = livePreviewFamily(visitHeadings);
