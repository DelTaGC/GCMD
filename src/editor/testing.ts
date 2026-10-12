/**
 * Test helpers: build a DOM-free `EditorState` with the markdown language
 * and turn a family's output into a comparable list.
 */
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdownExtension } from "./create";
import type { FamilyOutput } from "./livePreview/decorate";

export interface Cursor {
  anchor: number;
  head?: number;
}

/** A state whose syntax tree is fully parsed. */
export function stateWith(doc: string, cursor?: number | Cursor): EditorState {
  const selection =
    cursor === undefined
      ? undefined
      : typeof cursor === "number"
        ? EditorSelection.cursor(cursor)
        : EditorSelection.range(cursor.anchor, cursor.head ?? cursor.anchor);
  const state = EditorState.create({
    doc,
    extensions: [markdownExtension()],
    ...(selection ? { selection } : {}),
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

export interface DecoEntry {
  from: number;
  to: number;
  kind: string;
}

interface SpecLike {
  class?: string;
  widget?: { constructor: { name: string } };
}

/** Flattens decorations into `[from, to, kind]` tuples sorted by from, to, kind. */
export function listDecorations(out: FamilyOutput): DecoEntry[] {
  const entries: DecoEntry[] = [];
  const iter = out.decorations.iter();
  while (iter.value) {
    const spec = iter.value.spec as SpecLike;
    let kind: string;
    if (spec.widget) {
      kind = `widget:${spec.widget.constructor.name}`;
    } else if (iter.from === iter.to) {
      kind = `line:${spec.class ?? ""}`;
    } else if (spec.class !== undefined) {
      kind = `mark:${spec.class}`;
    } else {
      kind = "hide";
    }
    entries.push({ from: iter.from, to: iter.to, kind });
    iter.next();
  }
  return entries.sort((a, b) => a.from - b.from || a.to - b.to || a.kind.localeCompare(b.kind));
}

export function kinds(out: FamilyOutput): string[] {
  return listDecorations(out).map((e) => `${e.kind}@${String(e.from)}-${String(e.to)}`);
}
