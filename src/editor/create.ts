/**
 * EditorState / EditorView assembly. Keep this a flat list of extensions:
 * every feature lives in its own module.
 */
import { history } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { search } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  type ViewUpdate,
} from "@codemirror/view";
import "./commands";
import { buildKeymap } from "./keymap";
import { livePreview } from "./livePreview";
import { editorTheme } from "./theme";

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  dark: boolean;
  onUpdate?: (update: ViewUpdate) => void;
}

/** The markdown language: GFM via Lezer, fenced code languages loaded lazily. */
export function markdownExtension(): Extension {
  return markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    addKeymap: false,
  });
}

/** Builds a state for `doc`. `extra` lets tests add listeners. */
export function createEditorState(
  doc: string,
  dark: boolean,
  extra: Extension[] = [],
): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      EditorView.lineWrapping,
      EditorState.allowMultipleSelections.of(false),
      indentUnit.of("  "),
      markdownExtension(),
      livePreview,
      search({ top: true }),
      buildKeymap(),
      editorTheme(dark),
      ...extra,
    ],
  });
}

export function createEditor(options: EditorOptions): EditorView {
  const extra: Extension[] = [];
  const { onUpdate } = options;
  if (onUpdate) {
    extra.push(EditorView.updateListener.of(onUpdate));
  }
  return new EditorView({
    state: createEditorState(options.doc, options.dark, extra),
    parent: options.parent,
  });
}

/** Replaces the document, resetting history (used when opening a file). */
export function replaceDocument(view: EditorView, doc: string, dark: boolean): void {
  const listeners = view.state.facet(EditorView.updateListener);
  view.setState(
    createEditorState(
      doc,
      dark,
      listeners.map((listener) => EditorView.updateListener.of(listener)),
    ),
  );
}
