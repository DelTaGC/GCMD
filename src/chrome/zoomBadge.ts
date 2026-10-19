/**
 * The zoom badge: a small label over the editor's corner that shows the
 * text size for a moment after it changed. Plain DOM, owned by `app/zoom.ts`.
 */

/** How long the badge stays after the last change, in milliseconds. */
const VISIBLE_MS = 1200;

export interface ZoomBadge {
  readonly element: HTMLElement;
  show(text: string): void;
}

export function createZoomBadge(): ZoomBadge {
  const element = document.createElement("div");
  element.className = "zoom-badge";
  element.setAttribute("role", "status");
  element.hidden = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    element,
    show(text: string): void {
      element.textContent = text;
      element.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        element.hidden = true;
      }, VISIBLE_MS);
    },
  };
}
