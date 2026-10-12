/**
 * The active-block rule (CLAUDE.md invariant 2).
 *
 * A node is "active" when any selection range touches its block. For inline
 * marks the block is the line(s) the node spans; for fences, tables and
 * mermaid it is the whole node. Touching is inclusive at both ends, so a
 * cursor sitting right after the last character of a line still counts.
 *
 * This is the only place that decides whether markup is revealed. Every
 * live-preview family calls `isActive` with the node's range; nothing else
 * inspects the selection.
 */
import type { EditorState } from "@codemirror/state";

/** A half-open-looking but inclusive-at-both-ends document range. */
export interface Span {
  from: number;
  to: number;
}

/** Expands a range to the full lines it covers. */
export function lineSpan(state: EditorState, from: number, to: number): Span {
  const first = state.doc.lineAt(from);
  const last = to <= first.to ? first : state.doc.lineAt(to);
  return { from: first.from, to: last.to };
}

/** True when any selection range intersects `[from, to]` inclusively. */
export function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) {
      return true;
    }
  }
  return false;
}

/**
 * Applies the active-block rule to the node range `[from, to]`: the range is
 * first widened to whole lines, then tested against the selection. Callers
 * pass an inline node's own range (its line becomes the block) or a block
 * node's full range (the whole block is the block).
 */
export function isActive(state: EditorState, from: number, to: number): boolean {
  const span = lineSpan(state, from, to);
  return selectionTouches(state, span.from, span.to);
}
