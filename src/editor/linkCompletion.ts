/**
 * Completion of link destinations (ADR 0013).
 *
 * While the cursor is in the destination of `[text](…)`, `![alt](…)`,
 * `[text](<…>)` or a `[label]: …` definition, a popup offers:
 *
 * - the entries of the directory typed so far, relative to the document's
 *   folder (listed by the Rust `list_dir` command, one folder at a time).
 *   Picking a folder inserts `name/` and lists it in turn; image links only
 *   offer folders and images; hidden entries and `../` appear once the
 *   name typed starts with `.`;
 * - after `#`, the headings of this document as GitHub anchors.
 *
 * The destination is found from the line text, not the syntax tree: a link
 * being typed has no `)` yet, so Lezer does not see a link. Code spans and
 * code blocks are skipped. Names are percent-encoded where the destination
 * syntax needs it (`my file.md` -> `my%20file.md`; inside `<…>` spaces stay).
 * Keys go through the shortcut table (`keymap.ts`): Enter / Tab accept,
 * arrows and Page keys move, Escape closes, Ctrl+Space opens.
 */
import {
  autocompletion,
  insertCompletionText,
  pickedCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { Facet, type EditorState, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { isTauri } from "../ipc/env";
import { listDir, type DirEntry } from "../ipc/paths";
import { currentDocumentPath } from "./document";
import { collectHeadings, type Heading } from "./outline";

/** The destination being typed at the cursor. */
export interface LinkDestination {
  /** Offset where the destination text starts (after `(`, `(<` or `]: `). */
  readonly from: number;
  /** The destination text from `from` up to the cursor. */
  readonly text: string;
  /** `![alt](…)`: only folders and images are offered. */
  readonly image: boolean;
  /** `<…>` form: spaces are allowed as-is. */
  readonly angle: boolean;
}

/** Lists the directory part of a destination; rejects when it cannot. */
export type DirLister = (base: string | null, dir: string) => Promise<readonly DirEntry[]>;

const ipcLister: DirLister = (base, dir) => (isTauri() ? listDir(base, dir) : Promise.resolve([]));

/** Where directory listings come from; tests and the browser dev page swap it. */
export const dirLister = Facet.define<DirLister, DirLister>({
  combine: (values) => values[0] ?? ipcLister,
});

// Link text without nested brackets, then `(` and either `<…` or a bare destination.
const INLINE = /(!?)\[(?:[^[\]\\]|\\.)*\]\((?:<([^<>\n]*)|([^\s()<>]*))$/;
// A link reference definition: `[label]:` and at least one space.
const DEFINITION = /^ {0,3}\[(?:[^[\]\\]|\\.)+\]:[ \t]+(?:<([^<>\n]*)|(\S*))$/;

const CODE_NODES = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "HTMLBlock",
  "CommentBlock",
  "Comment",
]);

function inCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (CODE_NODES.has(node.name)) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

/** The link destination the cursor at `pos` is typing, if any. */
export function linkDestinationAt(state: EditorState, pos: number): LinkDestination | null {
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  let found: { text: string; image: boolean; angle: boolean } | null = null;
  const inline = INLINE.exec(before);
  if (inline) {
    const angle = inline[2] !== undefined;
    found = { text: (angle ? inline[2] : inline[3]) ?? "", image: inline[1] === "!", angle };
  } else {
    const definition = DEFINITION.exec(before);
    if (definition) {
      const angle = definition[1] !== undefined;
      found = { text: (angle ? definition[1] : definition[2]) ?? "", image: false, angle };
    }
  }
  if (!found || inCode(state, pos)) {
    return null;
  }
  return { from: pos - found.text.length, ...found };
}

/**
 * The anchor GitHub gives a heading: lower case, punctuation removed
 * (letters, marks, digits, `_`, `-` and spaces kept), spaces to `-`.
 */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** Anchors for `headings` in order; repeats get `-1`, `-2`, … like GitHub. */
export function headingAnchors(headings: readonly Heading[]): string[] {
  const seen = new Map<string, number>();
  return headings.map((heading) => {
    const base = githubSlug(heading.text);
    let slug = base;
    while (seen.has(slug)) {
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      slug = `${base}-${String(count)}`;
    }
    seen.set(slug, 0);
    return slug;
  });
}

/** Percent-encodes what would end or change the destination (`%` included). */
export function encodeName(name: string, angle: boolean): string {
  const special = angle ? /[<>%#?\n]/g : /[\s()<>%#?]/g;
  return name.replace(
    special,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i;
const MARKDOWN = /\.(md|markdown)$/i;
const SCHEME = /^[a-z][a-z0-9+.-]+:/i;

/** Inserts a folder name and lists the folder right away. */
function openFolder(view: EditorView, completion: Completion, from: number, to: number): void {
  view.dispatch({
    ...insertCompletionText(view.state, completion.label, from, to),
    annotations: pickedCompletion.of(completion),
  });
  startCompletion(view);
}

function entryOption(entry: DirEntry, dest: LinkDestination): Completion {
  const label = encodeName(entry.name, dest.angle);
  if (entry.isDir) {
    return { label: `${label}/`, type: "folder", boost: 2, apply: openFolder };
  }
  const markdown = !dest.image && MARKDOWN.test(entry.name);
  return { label, type: "file", boost: markdown ? 1 : 0 };
}

function headingResult(state: EditorState, dest: LinkDestination): CompletionResult | null {
  const headings = collectHeadings(state);
  if (headings.length === 0) {
    return null;
  }
  const anchors = headingAnchors(headings);
  return {
    from: dest.from,
    // Document order among equally good matches.
    options: headings.map((heading, i) => ({
      label: `#${anchors[i] ?? ""}`,
      detail: heading.text,
      type: "heading",
      boost: -Math.min(i, 99),
    })),
    validFor: /^#[^\s()<>]*$/,
  };
}

/** The completion source; exported for tests. */
export async function completeLinkDestination(
  context: CompletionContext,
): Promise<CompletionResult | null> {
  const { state, pos } = context;
  const dest = linkDestinationAt(state, pos);
  if (!dest) {
    return null;
  }
  if (dest.text.startsWith("#")) {
    return headingResult(state, dest);
  }
  if (SCHEME.test(dest.text) || /^www\./i.test(dest.text) || /[#?]/.test(dest.text)) {
    return null;
  }
  const slash = Math.max(dest.text.lastIndexOf("/"), dest.text.lastIndexOf("\\"));
  const dir = dest.text.slice(0, slash + 1);
  const partial = dest.text.slice(slash + 1);
  let entries: readonly DirEntry[];
  try {
    entries = await state.facet(dirLister)(currentDocumentPath(state), dir);
  } catch {
    return null; // unsaved document, missing folder, unreadable folder
  }
  if (context.aborted) {
    return null;
  }
  const hidden = partial.startsWith(".");
  const options = entries
    .filter(
      (e) => (hidden || !e.name.startsWith(".")) && (e.isDir || !dest.image || IMAGE.test(e.name)),
    )
    .map((e) => entryOption(e, dest));
  if (hidden) {
    options.push({ label: "../", type: "folder", boost: 2, apply: openFolder });
  }
  if (options.length === 0) {
    return null;
  }
  return {
    from: dest.from + slash + 1,
    options,
    validFor: dest.angle ? /^[^/\\<>]*$/ : /^[^/\\\s()<>]*$/,
  };
}

/** The extension: our source only (no HTML tag completion), keys in keymap.ts. */
export const linkCompletion: Extension = autocompletion({
  override: [completeLinkDestination],
  defaultKeymap: false,
  icons: false,
});
