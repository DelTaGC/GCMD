/**
 * Code fence commands: set or clear the info-string language of a fence,
 * and apply the auto-detected language to the unlabeled fence at the cursor.
 */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState, StateCommand, TransactionSpec } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { detectLanguage } from "../../detect/detectLanguage";
import { infoAliasFor } from "../languages";

/** The `FencedCode` node whose range contains `pos`, if any. */
export function fenceAt(state: EditorState, pos: number): SyntaxNode | null {
  const tree = ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
  for (const side of [1, -1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(pos, side);
    while (node) {
      if (node.name === "FencedCode") {
        return node;
      }
      node = node.parent;
    }
  }
  return null;
}

/**
 * The transaction that sets the fence's language to `language` (empty
 * string clears it). Only the first word of the info string is replaced;
 * attributes such as `{meta}` are kept.
 */
export function setFenceLanguageSpec(
  state: EditorState,
  fence: SyntaxNode,
  language: string,
): TransactionSpec | null {
  const open = fence.getChildren("CodeMark")[0];
  if (!open) {
    return null;
  }
  const info = fence.getChild("CodeInfo");
  if (!info) {
    return language === ""
      ? null
      : { changes: { from: open.to, insert: language }, userEvent: "input.fenceLanguage" };
  }
  const text = state.doc.sliceString(info.from, info.to);
  const word = /^\s*[^\s{]+/.exec(text);
  const wordEnd = info.from + (word ? word[0].length : 0);
  const rest = state.doc.sliceString(wordEnd, info.to);
  const insert = language === "" ? rest.trimStart() : language + rest;
  if (insert === text) {
    return null;
  }
  return {
    changes: { from: info.from, to: info.to, insert },
    userEvent: "input.fenceLanguage",
  };
}

/** Sets the language of the fence that starts on the line at `pos`. */
export function setFenceLanguageAt(
  view: { state: EditorState; dispatch: (tr: TransactionSpec) => void },
  pos: number,
  language: string,
): boolean {
  const fence = fenceAt(view.state, pos);
  if (!fence) {
    return false;
  }
  const spec = setFenceLanguageSpec(view.state, fence, language);
  if (spec) {
    view.dispatch(spec);
  }
  return true;
}

/** Labels the unlabeled fence at the cursor with the detected language. */
export const detectFenceLanguage: StateCommand = ({ state, dispatch }) => {
  const fence = fenceAt(state, state.selection.main.head);
  if (!fence || fence.getChild("CodeInfo")) {
    return false;
  }
  const text = fence.getChild("CodeText");
  const detected = detectLanguage(text ? state.doc.sliceString(text.from, text.to) : "");
  if (detected === null) {
    return false;
  }
  const spec = setFenceLanguageSpec(state, fence, infoAliasFor(detected));
  if (spec) {
    dispatch(state.update(spec));
  }
  return true;
};
