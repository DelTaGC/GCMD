/**
 * Mermaid diagrams: a ```mermaid fence is replaced by the rendered SVG when
 * the block is not active. Rendering is asynchronous (`mermaid/render.ts`
 * loads the library on first use); the widget shows a placeholder until the
 * result arrives, then asks the view to re-measure. Errors are shown inline
 * in the widget. Clicking the diagram puts the cursor on the first source
 * line, which reveals the fence.
 */
import type { EditorState } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { cachedMermaid, renderMermaid, type MermaidResult } from "../mermaid/render";
import { isDark } from "../theme";
import { infoLanguage } from "./codeFence";
import { blockFamily, type BlockVisitor } from "./decorate";

export class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly dark: boolean,
  ) {
    super();
  }

  override eq(other: MermaidWidget): boolean {
    return other.source === this.source && other.dark === this.dark;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-mermaid";
    const cached = cachedMermaid(this.source, this.dark);
    if (cached) {
      fill(wrapper, cached);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "cm-mermaid-pending";
      placeholder.textContent = "Rendering diagram…";
      wrapper.append(placeholder);
      void renderMermaid(this.source, this.dark).then((result) => {
        if (!wrapper.isConnected) {
          return;
        }
        fill(wrapper, result);
        view.requestMeasure();
      });
    }
    wrapper.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const start = view.posAtDOM(wrapper);
      const fenceLine = view.state.doc.lineAt(start);
      const target = fenceLine.number < view.state.doc.lines ? fenceLine.to + 1 : fenceLine.to;
      view.dispatch({
        selection: { anchor: target },
        scrollIntoView: true,
        userEvent: "select.pointer",
      });
      view.focus();
    });
    return wrapper;
  }

  override ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }
}

function fill(wrapper: HTMLElement, result: MermaidResult): void {
  wrapper.textContent = "";
  wrapper.classList.toggle("cm-mermaid-error", result.error !== undefined);
  if (result.svg !== undefined) {
    // Mermaid sanitizes its output (securityLevel "strict") before returning it.
    wrapper.innerHTML = result.svg;
    return;
  }
  const label = document.createElement("div");
  label.className = "cm-mermaid-error-title";
  label.textContent = "Mermaid diagram could not be rendered";
  const message = document.createElement("pre");
  message.className = "cm-mermaid-error-message";
  message.textContent = result.error ?? "unknown error";
  wrapper.append(label, message);
}

/** True for a fenced code block whose info string names mermaid. */
export function isMermaidFence(ref: SyntaxNodeRef, state: EditorState): boolean {
  if (ref.name !== "FencedCode") {
    return false;
  }
  const info = ref.node.getChild("CodeInfo");
  return (
    info !== null &&
    infoLanguage(state.doc.sliceString(info.from, info.to)).toLowerCase() === "mermaid"
  );
}

export const visitMermaidBlocks: BlockVisitor = (ref, state, blocks) => {
  if (ref.name !== "FencedCode") {
    return undefined;
  }
  if (isMermaidFence(ref, state)) {
    const text = ref.node.getChild("CodeText");
    const source = text ? state.doc.sliceString(text.from, text.to) : "";
    blocks.push({
      from: ref.from,
      to: ref.to,
      widget: new MermaidWidget(source, isDark(state)),
    });
  }
  return false;
};

export const mermaid = blockFamily(visitMermaidBlocks);
