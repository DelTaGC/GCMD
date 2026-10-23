/**
 * Native spell-check (ADR 0014): the webview's own checker (WebView2,
 * WKWebView, WebKitGTK) runs on the editor's content when its `spellcheck`
 * attribute is on. CodeMirror turns it off by default; this compartment
 * switches it, and `replaceDocument` carries the flag into a new state like
 * line wrap. Code, URLs and HTML are excluded by `livePreview/spelling.ts`.
 * Languages belong to the OS. WebView2 checks words as they are typed or
 * edited and offers suggestions on right-click, but no "Add to dictionary".
 */
import { Compartment, Facet, type EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const spellcheckCompartment = new Compartment();

const spellchecking = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
});

function spellcheckConfig(on: boolean): Extension {
  return on
    ? [EditorView.contentAttributes.of({ spellcheck: "true" }), spellchecking.of(true)]
    : [];
}

/** Install once; `setSpellcheck` switches it later. */
export function spellcheckExtension(on: boolean): Extension {
  return spellcheckCompartment.of(spellcheckConfig(on));
}

export function isSpellchecking(state: EditorState): boolean {
  return state.facet(spellchecking);
}

export function setSpellcheck(view: EditorView, on: boolean): void {
  if (isSpellchecking(view.state) !== on) {
    view.dispatch({ effects: spellcheckCompartment.reconfigure(spellcheckConfig(on)) });
  }
}
