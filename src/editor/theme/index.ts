/**
 * Editor theme. All colors come from the CSS custom properties defined in
 * `src/styles.css` (`:root` and `:root[data-theme="dark"]`); this module only
 * toggles CodeMirror's own dark/light base (caret, selection defaults) and
 * installs the class-based syntax highlighter whose `tok-*` classes are
 * styled in `editor.css`.
 */
import { syntaxHighlighting } from "@codemirror/language";
import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import "./editor.css";

export const darkCompartment = new Compartment();

function baseTheme(dark: boolean): Extension {
  return EditorView.theme({}, { dark });
}

/** Extensions to install once; use `darkThemeEffect` to switch later. */
export function editorTheme(dark: boolean): Extension {
  return [darkCompartment.of(baseTheme(dark)), syntaxHighlighting(classHighlighter)];
}

/** Switches the editor's dark/light base without rebuilding the state. */
export function setEditorDark(view: EditorView, dark: boolean): void {
  view.dispatch({ effects: darkCompartment.reconfigure(baseTheme(dark)) });
}
