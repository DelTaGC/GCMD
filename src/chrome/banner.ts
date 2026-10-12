/**
 * A dismissable message strip above the editor, used for errors that should
 * not interrupt with a modal (unreadable file, failed save) and later for
 * the external-change notice (phase 4).
 */
export type BannerKind = "info" | "warning" | "error";

export interface Banner {
  readonly element: HTMLElement;
  show(kind: BannerKind, text: string): void;
  hide(): void;
}

export function createBanner(): Banner {
  const element = document.createElement("div");
  element.className = "banner";
  element.hidden = true;
  element.setAttribute("role", "status");

  const text = document.createElement("span");
  text.className = "banner-text";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "banner-close";
  close.title = "Dismiss";
  close.textContent = "×";
  element.append(text, close);

  const hide = (): void => {
    element.hidden = true;
  };
  close.addEventListener("click", hide);

  return {
    element,
    show(kind, message): void {
      element.dataset["kind"] = kind;
      text.textContent = message;
      element.hidden = false;
    },
    hide,
  };
}
