/**
 * Inline formatting toggles: strong, emphasis, inline code, strikethrough,
 * and link insertion. All are `StateCommand`s so they run without a DOM.
 *
 * Toggle logic uses the syntax tree: if the selection sits inside a node of
 * the requested kind, its markers are removed; otherwise the selection (or
 * the word at the cursor, or an empty pair) is wrapped.
 */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState, type StateCommand } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

interface WrapKind {
  node: string;
  mark: string;
  before: string;
  after: string;
}

export const STRONG: WrapKind = {
  node: "StrongEmphasis",
  mark: "EmphasisMark",
  before: "**",
  after: "**",
};
export const EMPHASIS: WrapKind = {
  node: "Emphasis",
  mark: "EmphasisMark",
  before: "*",
  after: "*",
};
export const INLINE_CODE: WrapKind = {
  node: "InlineCode",
  mark: "CodeMark",
  before: "`",
  after: "`",
};
export const STRIKETHROUGH: WrapKind = {
  node: "Strikethrough",
  mark: "StrikethroughMark",
  before: "~~",
  after: "~~",
};

function treeFor(state: EditorState, upTo: number): ReturnType<typeof syntaxTree> {
  return ensureSyntaxTree(state, upTo, 100) ?? syntaxTree(state);
}

/** The innermost node named `name` that fully contains `[from, to]`. */
export function enclosingNode(
  state: EditorState,
  from: number,
  to: number,
  name: string,
): SyntaxNode | null {
  const tree = treeFor(state, to);
  for (const side of [1, -1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(from, side);
    while (node) {
      if (node.name === name && node.from <= from && node.to >= to) {
        return node;
      }
      node = node.parent;
    }
  }
  return null;
}

/** Builds a toggle command for one wrap kind. */
export function toggleWrap(kind: WrapKind): StateCommand {
  return ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      const wrapped = enclosingNode(state, range.from, range.to, kind.node);
      if (wrapped) {
        const marks = wrapped.getChildren(kind.mark);
        const changes = marks.map((m) => ({ from: m.from, to: m.to, insert: "" }));
        const set = state.changes(changes);
        return {
          changes: set,
          range: EditorSelection.range(set.mapPos(range.anchor), set.mapPos(range.head)),
        };
      }
      let { from, to } = range;
      if (from === to) {
        const word = state.wordAt(from);
        if (word) {
          from = word.from;
          to = word.to;
        } else {
          const insert = kind.before + kind.after;
          return {
            changes: { from, insert },
            range: EditorSelection.cursor(from + kind.before.length),
          };
        }
      }
      const changes = state.changes([
        { from, insert: kind.before },
        { from: to, insert: kind.after },
      ]);
      return {
        changes,
        range: EditorSelection.range(from + kind.before.length, to + kind.before.length),
      };
    });
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input.format" }));
    return true;
  };
}

export const toggleStrong = toggleWrap(STRONG);
export const toggleEmphasis = toggleWrap(EMPHASIS);
export const toggleInlineCode = toggleWrap(INLINE_CODE);
export const toggleStrikethrough = toggleWrap(STRIKETHROUGH);

/** Inline nodes whose marks `clearFormatting` removes, with their mark names. */
const CLEARABLE: Readonly<Record<string, readonly string[]>> = {
  StrongEmphasis: ["EmphasisMark"],
  Emphasis: ["EmphasisMark"],
  InlineCode: ["CodeMark"],
  Strikethrough: ["StrikethroughMark"],
};

/**
 * Removes inline formatting (strong, emphasis, inline code, strikethrough,
 * links) from every node touching the selection; the text is kept, a link
 * keeps its text and loses its destination. An empty selection clears the
 * whole line.
 */
export const clearFormatting: StateCommand = ({ state, dispatch }) => {
  const seen = new Set<string>();
  const changes: { from: number; to: number; insert: string }[] = [];
  const remove = (from: number, to: number): void => {
    const key = `${String(from)}-${String(to)}`;
    if (to > from && !seen.has(key)) {
      seen.add(key);
      changes.push({ from, to, insert: "" });
    }
  };
  for (const range of state.selection.ranges) {
    let { from, to } = range;
    if (from === to) {
      const line = state.doc.lineAt(from);
      from = line.from;
      to = line.to;
    }
    treeFor(state, to).iterate({
      from,
      to,
      enter: (node) => {
        const marks = CLEARABLE[node.name];
        if (marks) {
          for (const child of node.node.getChildren(marks[0] ?? "")) {
            remove(child.from, child.to);
          }
          return true;
        }
        if (node.name === "Link") {
          const [open, close] = node.node.getChildren("LinkMark");
          if (open && close) {
            remove(open.from, open.to);
            remove(close.from, node.to);
          }
          return true;
        }
        return undefined;
      },
    });
  }
  if (changes.length === 0) {
    return false;
  }
  const set = state.changes(changes);
  dispatch(
    state.update({
      changes: set,
      selection: state.selection.map(set),
      scrollIntoView: true,
      userEvent: "delete.format",
    }),
  );
  return true;
};

const URL_LIKE = /^(https?:\/\/|www\.|mailto:)\S+$/i;

/**
 * Wraps the selection as a link. A selected URL becomes the destination with
 * the cursor in the empty text; any other selection becomes the text with
 * `url` selected; an empty selection inserts `[text](url)` with `text`
 * selected.
 */
export const insertLink: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const selected = state.doc.sliceString(range.from, range.to);
    if (selected.length > 0 && URL_LIKE.test(selected)) {
      const insert = `[](${selected})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    const text = selected.length > 0 ? selected : "text";
    const insert = `[${text}](url)`;
    const urlFrom = range.from + text.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range:
        selected.length > 0
          ? EditorSelection.range(urlFrom, urlFrom + 3)
          : EditorSelection.range(range.from + 1, range.from + 1 + text.length),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input.format" }));
  return true;
};
