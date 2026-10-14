/**
 * Line wrapping as editor configuration: a compartment that holds
 * `EditorView.lineWrapping` (or nothing), and the side margin of the text
 * column as the `--wrap-margin` CSS variable on the editor root, which
 * `theme/editor.css` uses as the content's horizontal padding. The layout
 * (how wide, which mode) is decided by `app/wrap.ts`.
 */
import { Compartment, Facet, type EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const wrapCompartment = new Compartment();

const wrapping = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
});

function wrapConfig(wrap: boolean): Extension {
  return wrap ? [EditorView.lineWrapping, wrapping.of(true)] : [];
}

/** Install once; `setEditorWrap` switches it later. */
export function wrapExtension(wrap: boolean): Extension {
  return wrapCompartment.of(wrapConfig(wrap));
}

export function isWrapping(state: EditorState): boolean {
  return state.facet(wrapping);
}

/** Turns wrapping on or off and sets the margin on each side of the text, in pixels. */
export function setEditorWrap(view: EditorView, wrap: boolean, margin: number): void {
  if (isWrapping(view.state) !== wrap) {
    view.dispatch({ effects: wrapCompartment.reconfigure(wrapConfig(wrap)) });
  }
  const value = `${String(margin)}px`;
  if (view.dom.style.getPropertyValue("--wrap-margin") !== value) {
    view.dom.style.setProperty("--wrap-margin", value);
    view.requestMeasure();
  }
}
