/**
 * The path of the document being edited, as editor state. Live-preview
 * families need it to resolve relative image and link targets; the session
 * (`app/session.ts`) sets it when a file is opened or saved under a new name.
 * `null` means an untitled document.
 */
import { Compartment, Facet, type EditorState, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export const documentPath = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});

const pathCompartment = new Compartment();

export function documentPathExtension(path: string | null): Extension {
  return pathCompartment.of(documentPath.of(path));
}

export function setDocumentPath(view: EditorView, path: string | null): void {
  view.dispatch({ effects: pathCompartment.reconfigure(documentPath.of(path)) });
}

export function currentDocumentPath(state: EditorState): string | null {
  return state.facet(documentPath);
}
