/**
 * Vertical cursor movement that steps into rendered blocks.
 *
 * CodeMirror's `cursorLineDown` / `cursorLineUp` skip block widgets, so a
 * rendered table or diagram would be jumped over and could only be entered by
 * mouse. These wrappers detect the jump and put the cursor at the block's
 * first (moving down) or last (moving up) position instead, which makes the
 * block active and reveals its source.
 */
import { cursorLineDown, cursorLineUp } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";
import { blockRanges } from "../livePreview/decorate";

function moveInto(view: EditorView, forward: boolean): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) {
    return forward ? cursorLineDown(view) : cursorLineUp(view);
  }
  const target = view.moveVertically(range, forward);
  const blocks = state.facet(blockRanges);
  const jumped = forward
    ? blocks.find((b) => b.from > range.head && target.head >= b.to)
    : blocks.find((b) => b.to < range.head && target.head <= b.from);
  if (!jumped) {
    return forward ? cursorLineDown(view) : cursorLineUp(view);
  }
  view.dispatch({
    selection: EditorSelection.cursor(forward ? jumped.from : jumped.to),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

export const lineDownIntoBlocks: Command = (view) => moveInto(view, true);
export const lineUpIntoBlocks: Command = (view) => moveInto(view, false);

/**
 * Puts the cursor at `pos` and scrolls that line to the top of the view
 * (outline clicks). The only way chrome code moves the cursor.
 */
export function jumpTo(view: EditorView, pos: number): void {
  const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
  view.dispatch({
    selection: EditorSelection.cursor(clamped),
    effects: EditorView.scrollIntoView(clamped, { y: "start", yMargin: 24 }),
    userEvent: "select",
  });
  view.focus();
}
