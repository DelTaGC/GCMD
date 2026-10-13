/**
 * A dismissable message strip above the editor, used for errors that should
 * not interrupt with a modal (unreadable file, failed save) and for the
 * external-change notice, which carries action buttons (Reload / Keep).
 */
export type BannerKind = "info" | "warning" | "error";

export interface BannerAction {
  readonly label: string;
  /** Runs when the button is clicked; the banner hides afterwards. */
  readonly run: () => void;
}

export interface Banner {
  readonly element: HTMLElement;
  readonly visible: boolean;
  show(kind: BannerKind, text: string, actions?: readonly BannerAction[]): void;
  hide(): void;
}

export function createBanner(): Banner {
  const element = document.createElement("div");
  element.className = "banner";
  element.hidden = true;
  element.setAttribute("role", "status");

  const text = document.createElement("span");
  text.className = "banner-text";
  const actions = document.createElement("span");
  actions.className = "banner-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "banner-close";
  close.title = "Dismiss";
  close.textContent = "×";
  element.append(text, actions, close);

  const hide = (): void => {
    element.hidden = true;
    actions.textContent = "";
  };
  close.addEventListener("click", hide);

  return {
    element,
    get visible(): boolean {
      return !element.hidden;
    },
    show(kind, message, buttons = []): void {
      element.dataset["kind"] = kind;
      text.textContent = message;
      actions.textContent = "";
      for (const action of buttons) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "banner-action";
        button.textContent = action.label;
        button.addEventListener("click", () => {
          hide();
          action.run();
        });
        actions.append(button);
      }
      element.hidden = false;
    },
    hide,
  };
}
