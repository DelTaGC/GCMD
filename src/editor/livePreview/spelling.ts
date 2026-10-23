/**
 * Spell-check exclusions: code (inline, fenced, indented), URLs, autolinks
 * and HTML get `spellcheck="false"`, so the native checker (`editor/spellcheck.ts`)
 * only underlines prose. Marks are added per line, never across a line break.
 */
import type { Extension } from "@codemirror/state";
import { livePreviewFamily, type NodeVisitor } from "./decorate";

const NO_SPELL = { spellcheck: "false" };

/** Nodes whose whole text is excluded; their children are not visited. */
const EXCLUDED = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "URL",
  "Autolink",
  "HTMLTag",
  "HTMLBlock",
  "CommentBlock",
  "Comment",
]);

export const visitSpelling: NodeVisitor = (ref, state, out) => {
  if (!EXCLUDED.has(ref.name)) {
    return undefined;
  }
  let pos = ref.from;
  while (pos < ref.to) {
    const line = state.doc.lineAt(pos);
    out.mark(pos, Math.min(line.to, ref.to), "cm-nospell", NO_SPELL);
    pos = line.to + 1;
  }
  return false;
};

export const spelling: Extension = livePreviewFamily(visitSpelling);
