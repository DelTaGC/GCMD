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
import { documentPathExtension } from "./document";
import { buildKeymap } from "./keymap";
import { linkOpener } from "./links";
import { livePreview } from "./livePreview";
import { quickbar } from "./quickbar";
import { editorTheme } from "./theme";
import { isWrapping, wrapExtension } from "./wrap";

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  dark: boolean;
  /** Path of the file being edited; `null` for an untitled document. */
  path?: string | null;
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
  path: string | null = null,
  wrap = true,
): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      wrapExtension(wrap),
      EditorState.allowMultipleSelections.of(false),
      indentUnit.of("  "),
      documentPathExtension(path),
      markdownExtension(),
      livePreview,
      linkOpener,
      quickbar,
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
    state: createEditorState(options.doc, options.dark, extra, options.path ?? null),
    parent: options.parent,
  });
}

/** Replaces the document, resetting history (used when opening a file). */
export function replaceDocument(
  view: EditorView,
  doc: string,
  dark: boolean,
  path: string | null,
): void {
  const listeners = view.state.facet(EditorView.updateListener);
  view.setState(
    createEditorState(
      doc,
      dark,
      listeners.map((listener) => EditorView.updateListener.of(listener)),
      path,
      isWrapping(view.state),
    ),
  );
}
