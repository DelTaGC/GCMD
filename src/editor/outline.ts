/**
 * The heading outline, computed from the Lezer syntax tree. Pure functions
 * over an `EditorState`: the sidebar (`chrome/sidebar.ts`) renders what
 * `app/outline.ts` computes here, debounced, after the tree changed.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef, Tree } from "@lezer/common";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface Heading {
  readonly level: HeadingLevel;
  /** Heading text without `#` marks or inline markup, whitespace collapsed. */
  readonly text: string;
  /** Start of the heading node (start of its first line). */
  readonly from: number;
  readonly to: number;
}

export interface OutlineNode {
  readonly heading: Heading;
  /** Index into the flat `Heading[]` list the tree was built from. */
  readonly index: number;
  readonly children: OutlineNode[];
}

const ATX = /^ATXHeading([1-6])$/;
const SETEXT = /^SetextHeading([12])$/;

/** Nodes whose children may contain headings. */
const CONTAINERS = new Set(["Document", "BulletList", "OrderedList", "ListItem", "Blockquote"]);

/** Markup nodes whose text never belongs in the outline. */
const MARKUP = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "LinkMark",
  "URL",
  "LinkTitle",
  "LinkLabel",
  "HTMLTag",
  "Comment",
]);

function headingLevel(name: string): HeadingLevel | null {
  const match = ATX.exec(name) ?? SETEXT.exec(name);
  if (!match) {
    return null;
  }
  return Number(match[1]) as HeadingLevel;
}

/** The content of a heading node with markup removed and whitespace collapsed. */
export function headingText(state: EditorState, tree: Tree, from: number, to: number): string {
  let out = "";
  let pos = from;
  tree.iterate({
    from,
    to,
    enter: (node) => {
      if (node.from < from || node.to > to) {
        return true; // an ancestor: descend into it
      }
      if (node.from < pos) {
        return false; // inside markup already consumed
      }
      if (MARKUP.has(node.name)) {
        out += state.doc.sliceString(pos, node.from);
        pos = node.to;
        return false;
      }
      if (node.name === "Escape") {
        // `\*` keeps the `*`, drops the backslash.
        out += state.doc.sliceString(pos, node.from);
        pos = node.from + 1;
        return false;
      }
      return true;
    },
  });
  out += state.doc.sliceString(pos, to);
  return out.replace(/\s+/g, " ").trim();
}

/** Every heading of the document in order, from the current syntax tree. */
export function collectHeadings(state: EditorState): Heading[] {
  const tree = syntaxTree(state);
  const headings: Heading[] = [];
  tree.iterate({
    enter: (node: SyntaxNodeRef) => {
      const level = headingLevel(node.name);
      if (level !== null) {
        headings.push({
          level,
          text: headingText(state, tree, node.from, node.to),
          from: node.from,
          to: node.to,
        });
        return false;
      }
      return CONTAINERS.has(node.name);
    },
  });
  return headings;
}

/**
 * Nests headings by level: a heading becomes a child of the nearest
 * preceding heading with a smaller level. Skipped levels (`#` then `###`)
 * nest directly; a `##` after a `###` closes the `###`.
 */
export function buildOutline(headings: readonly Heading[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  headings.forEach((heading, index) => {
    const node: OutlineNode = { heading, index, children: [] };
    while (stack.length > 0 && (stack[stack.length - 1]?.heading.level ?? 0) >= heading.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    (parent ? parent.children : roots).push(node);
    stack.push(node);
  });
  return roots;
}

/**
 * Index of the heading whose section contains `pos`: the last heading
 * starting at or before `pos`, or -1 before the first heading.
 */
export function activeHeading(headings: readonly Heading[], pos: number): number {
  let lo = 0;
  let hi = headings.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((headings[mid]?.from ?? Infinity) <= pos) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** True when both lists describe the same headings (for cheap change checks). */
export function sameHeadings(a: readonly Heading[], b: readonly Heading[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((h, i) => {
    const other = b[i];
    return (
      other?.level === h.level &&
      other.text === h.text &&
      other.from === h.from &&
      other.to === h.to
    );
  });
}
