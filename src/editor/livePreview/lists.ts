/**
 * Lists and task items.
 *
 * Bullet markers (`-`, `*`, `+`) are replaced by a bullet glyph when the line
 * is not active; ordered markers are muted. On the active line every marker
 * shows in the markup color. Task markers (`[ ]` / `[x]`)
 * become a real checkbox when the line is not active. Clicking the checkbox
 * toggles the marker in the text through a normal transaction without moving
 * the selection, so the line stays inactive and the checkbox stays rendered.
 */
import type { EditorState, TransactionSpec } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { isActive } from "./activeBlock";
import { livePreviewFamily, type Collector, type NodeVisitor } from "./decorate";

class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-bullet";
    span.textContent = "•";
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const bullet = new BulletWidget();

export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked;
  }

  override toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-task-checkbox";
    input.checked = this.checked;
    input.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    input.addEventListener("click", (event) => {
      event.preventDefault();
      const pos = view.posAtDOM(input);
      toggleTaskMarkerAt(view, pos);
    });
    return input;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Flips the `[ ]` / `[x]` marker that starts at `pos`. Exported for tests
 * and for the future "toggle task" command.
 */
export function toggleTaskMarkerAt(
  view: { state: EditorState; dispatch: (tr: TransactionSpec) => void },
  pos: number,
): boolean {
  const marker = view.state.doc.sliceString(pos, pos + 3);
  if (!/^\[[ xX]\]$/.test(marker)) {
    return false;
  }
  const checked = marker !== "[ ]";
  view.dispatch({
    changes: { from: pos + 1, to: pos + 2, insert: checked ? " " : "x" },
    userEvent: "input.toggleTask",
  });
  return true;
}

function decorateListMark(ref: SyntaxNodeRef, state: EditorState, out: Collector): void {
  const item = ref.node.parent;
  const list = item?.parent;
  const task = item?.getChild("Task");
  const taskMarker = task?.getChild("TaskMarker");
  const active = isActive(state, ref.from, ref.to);
  if (taskMarker?.from === ref.to + 1 && !active) {
    // The checkbox stands in for both the bullet and the marker.
    out.hide(ref.from, taskMarker.from);
    return;
  }
  if (active) {
    out.mark(ref.from, ref.to, "cm-mark");
    return;
  }
  if (list?.name === "BulletList") {
    out.replace(ref.from, ref.to, bullet);
    return;
  }
  out.mark(ref.from, ref.to, "cm-list-mark");
}

function decorateTaskMarker(ref: SyntaxNodeRef, state: EditorState, out: Collector): void {
  if (isActive(state, ref.from, ref.to)) {
    out.mark(ref.from, ref.to, "cm-mark cm-task-marker");
    return;
  }
  const text = state.doc.sliceString(ref.from, ref.to);
  const checked = text !== "[ ]";
  // Replace the marker and the following space so the checkbox hugs the text.
  const next = state.doc.sliceString(ref.to, ref.to + 1);
  out.replace(ref.from, next === " " ? ref.to + 1 : ref.to, new CheckboxWidget(checked));
}

export const visitLists: NodeVisitor = (ref, state, out) => {
  switch (ref.name) {
    case "ListMark":
      decorateListMark(ref, state, out);
      return false;
    case "TaskMarker":
      decorateTaskMarker(ref, state, out);
      return false;
    case "Task":
      if (/^\[[xX]\]/.test(state.doc.sliceString(ref.from, ref.from + 3))) {
        out.mark(ref.from, ref.to, "cm-task-done");
      }
      return undefined;
    default:
      return undefined;
  }
};

export const lists = livePreviewFamily(visitLists);
