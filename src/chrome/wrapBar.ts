/**
 * The wrap bar: a thin strip under the editor showing the text column.
 * Margins are light, the text column darker; with wrapping off the whole
 * strip is light. Dragging moves both edges of the column symmetrically,
 * double-clicking changes the mode. Plain DOM: it reports drags and
 * double-clicks to its owner (`app/wrap.ts`) and draws what it is given.
 */
import type { WrapMode } from "../ipc/settings";

/** Pixels the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export interface WrapBarState {
  mode: WrapMode;
  /** Margin on each side of the text column, in pixels. */
  margin: number;
  /** Width of the text column, in pixels. */
  text: number;
  /** Tooltip. */
  title: string;
}

export interface WrapBarHandlers {
  /** The pointer dragged an edge: each margin should become `margin` pixels. */
  onDrag(margin: number): void;
  /** A drag finished (persist now). */
  onDragEnd(): void;
  /** Double-click: switch to the next mode. */
  onCycle(): void;
}

export interface WrapBar {
  readonly element: HTMLElement;
  update(state: WrapBarState): void;
}

export function createWrapBar(handlers: WrapBarHandlers): WrapBar {
  const element = document.createElement("div");
  element.className = "wrap-bar";
  const column = document.createElement("div");
  column.className = "wrap-bar-text";
  element.append(column);

  let current: WrapBarState | null = null;
  let drag: {
    pointer: number;
    startX: number;
    margin: number;
    sign: number;
    moved: boolean;
  } | null = null;

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !current || current.mode === "off") {
      return;
    }
    const x = event.clientX - element.getBoundingClientRect().left;
    // The half the press started in says which edge follows the pointer.
    const left = x < current.margin + current.text / 2;
    drag = {
      pointer: event.pointerId,
      startX: event.clientX,
      margin: current.margin,
      sign: left ? 1 : -1,
      moved: false,
    };
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  element.addEventListener("pointermove", (event) => {
    if (drag?.pointer !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) {
      return;
    }
    drag.moved = true;
    handlers.onDrag(drag.margin + drag.sign * dx);
  });
  const finish = (event: PointerEvent): void => {
    if (drag?.pointer !== event.pointerId) {
      return;
    }
    const { moved } = drag;
    drag = null;
    if (moved) {
      handlers.onDragEnd();
    }
  };
  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
  element.addEventListener("dblclick", () => {
    handlers.onCycle();
  });

  return {
    element,
    update(state): void {
      current = state;
      element.dataset["mode"] = state.mode;
      element.title = state.title;
      column.style.left = `${String(state.margin)}px`;
      column.style.width = `${String(state.text)}px`;
    },
  };
}
