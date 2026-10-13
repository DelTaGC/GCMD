/**
 * Editor theme. All colors come from the CSS custom properties defined in
 * `src/styles.css` (`:root` and `:root[data-theme="dark"]`); this module only
 * toggles CodeMirror's own dark/light base (caret, selection defaults) and
 * installs the class-based syntax highlighter whose `tok-*` classes are
 * styled in `editor.css`. The `editorDark` facet lets widgets that render
 * their own graphics (mermaid) pick matching colors.
 */
import { syntaxHighlighting } from "@codemirror/language";
import { Compartment, Facet, type EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import "./editor.css";

export const darkCompartment = new Compartment();

/** Whether the editor currently uses the dark theme. */
export const editorDark = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
});

function baseTheme(dark: boolean): Extension {
  return [EditorView.theme({}, { dark }), editorDark.of(dark)];
}

/** Extensions to install once; use `setEditorDark` to switch later. */
export function editorTheme(dark: boolean): Extension {
  return [darkCompartment.of(baseTheme(dark)), syntaxHighlighting(classHighlighter)];
}

/** Switches the editor's dark/light base without rebuilding the state. */
export function setEditorDark(view: EditorView, dark: boolean): void {
  view.dispatch({ effects: darkCompartment.reconfigure(baseTheme(dark)) });
}

export function isDark(state: EditorState): boolean {
  return state.facet(editorDark);
}
