/**
 * Thematic breaks: `---`, `***`, `___`. Rendered as a rule when the line is
 * not active; the source characters are shown muted when it is.
 */
import { WidgetType } from "@codemirror/view";
import { isActive } from "./activeBlock";
import { livePreviewFamily, type NodeVisitor } from "./decorate";

class RuleWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-hr";
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const rule = new RuleWidget();

export const visitHr: NodeVisitor = (ref, state, out) => {
  if (ref.name !== "HorizontalRule") {
    return undefined;
  }
  if (isActive(state, ref.from, ref.to)) {
    out.mark(ref.from, ref.to, "cm-mark");
  } else {
    out.replace(ref.from, ref.to, rule);
  }
  return false;
};

export const hr = livePreviewFamily(visitHr);
