/**
 * Fenced and indented code blocks.
 *
 * Every line of a block gets a monospace background class. When a fenced
 * block is not active (the selection touches none of its lines) the opening
 * fence is replaced by a small language label and the closing fence is
 * emptied, so the fence lines act as the block's padding. Syntax
 * highlighting inside the block comes from the nested language parser and
 * the class highlighter in `editor/theme/`; the language dropdown and the
 * auto-detect heuristic arrive in phase 3.
 */
import type { EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { isActive } from "./activeBlock";
import { livePreviewFamily, type Collector, type NodeVisitor } from "./decorate";

class LanguageLabelWidget extends WidgetType {
  constructor(readonly language: string) {
    super();
  }

  override eq(other: LanguageLabelWidget): boolean {
    return other.language === this.language;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-code-label";
    span.textContent = this.language;
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

class EmptyWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-code-fence-end";
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const emptyFence = new EmptyWidget();

function markLines(ref: SyntaxNodeRef, state: EditorState, out: Collector): void {
  const first = state.doc.lineAt(ref.from);
  const last = state.doc.lineAt(ref.to);
  for (let n = first.number; n <= last.number; n += 1) {
    const line = state.doc.line(n);
    let cls = "cm-code-line";
    if (n === first.number) {
      cls += " cm-code-first";
    }
    if (n === last.number) {
      cls += " cm-code-last";
    }
    out.line(line.from, cls);
  }
}

/** The language word of the info string (`ts {meta}` -> `ts`). */
export function infoLanguage(info: string): string {
  const word = /^\s*([^\s{]+)/.exec(info);
  return word?.[1] ?? "";
}

function decorateFence(ref: SyntaxNodeRef, state: EditorState, out: Collector): void {
  markLines(ref, state, out);
  const node = ref.node;
  const marks = node.getChildren("CodeMark");
  const info = node.getChild("CodeInfo");
  const infoText = info ? state.doc.sliceString(info.from, info.to) : "";
  if (isActive(state, ref.from, ref.to)) {
    for (const mark of marks) {
      out.mark(mark.from, mark.to, "cm-mark");
    }
    if (info) {
      out.mark(info.from, info.to, "cm-code-info");
    }
    return;
  }
  const openLine = state.doc.lineAt(ref.from);
  out.replace(openLine.from, openLine.to, new LanguageLabelWidget(infoLanguage(infoText)));
  const closing = marks[1];
  if (closing?.to === ref.to) {
    const closeLine = state.doc.lineAt(closing.from);
    if (closeLine.number !== openLine.number) {
      out.replace(closeLine.from, closeLine.to, emptyFence);
    }
  }
}

export const visitCodeFence: NodeVisitor = (ref, state, out) => {
  if (ref.name === "FencedCode") {
    decorateFence(ref, state, out);
    return false;
  }
  if (ref.name === "CodeBlock") {
    markLines(ref, state, out);
    return false;
  }
  return undefined;
};

export const codeFence = livePreviewFamily(visitCodeFence);
