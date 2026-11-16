/**
 * List commands on whole lines.
 *
 * `list.toggleTask` cycles every line touched by the selection the way
 * Obsidian's Ctrl+L does. A plain line becomes `- [ ] `, a list item gains
 * `[ ] `, an open task closes (`[x]`) and a closed one opens again.
 *
 * `list.toggleBullets` turns the touched lines into a bullet list, one item
 * per line, or removes the markers when they are all items already.
 *
 * Lines inside blockquotes keep their `>` prefix.
 */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { StateCommand } from "@codemirror/state";

const LINE = /^((?:\s*>)*\s*)(?:([-*+]|\d{1,9}[.)])([ \t]+))?(\[([ xX])\][ \t]+)?/;

interface LineChange {
  from: number;
  to: number;
  insert: string;
}

/** The edit that toggles one line, or `null` for a line to leave alone. */
export function toggleTaskChange(lineFrom: number, text: string): LineChange | null {
  const match = LINE.exec(text);
  if (!match) {
    return null;
  }
  const prefix = match[1] ?? "";
  const marker = match[2];
  const markerGap = match[3] ?? "";
  const task = match[4];
  const checked = match[5];
  if (marker !== undefined && task !== undefined && checked !== undefined) {
    const boxFrom = lineFrom + prefix.length + marker.length + markerGap.length + 1;
    return { from: boxFrom, to: boxFrom + 1, insert: checked === " " ? "x" : " " };
  }
  if (marker !== undefined) {
    const at = lineFrom + prefix.length + marker.length + markerGap.length;
    return { from: at, to: at, insert: "[ ] " };
  }
  const at = lineFrom + prefix.length;
  return { from: at, to: at, insert: "- [ ] " };
}

// ---------------------------------------------------------------------------
// Bullets

/** A list item line: container prefix, marker, the gap after it, an optional task box. */
const ITEM = /^((?:\s*>)*\s*)([-*+]|\d{1,9}[.)])([ \t]+|$)(\[[ xX]\][ \t]+)?/;
const PREFIX = /^(?:\s*>)*\s*/;

export interface BulletLine {
  readonly from: number;
  /** Position right after the line (its `to`). */
  readonly to: number;
  readonly text: string;
  /** Inside code, a table or HTML: never touched. */
  readonly code: boolean;
}

export interface BulletEdit {
  readonly changes: LineChange[];
  /** True when bullets were added, false when they were removed. */
  readonly added: boolean;
}

function isBlankLine(line: BulletLine): boolean {
  return !line.code && line.text.slice((PREFIX.exec(line.text)?.[0] ?? "").length).trim() === "";
}

/**
 * Toggles bullets on `lines` (consecutive document lines). When every text
 * line is already a list item, the markers (and task boxes) are removed.
 * Otherwise each text line that is not an item gets `- ` after its quote
 * prefix and indentation, and blank lines between two text lines are
 * dropped, so paragraphs and lines alike become the items of one tight
 * list. Code, tables and HTML are left alone. `null` when there is no text.
 */
export function toggleBulletChanges(lines: readonly BulletLine[]): BulletEdit | null {
  const text = lines.filter((line) => !line.code && !isBlankLine(line));
  if (text.length === 0) {
    return null;
  }
  if (text.every((line) => ITEM.test(line.text))) {
    const changes = text.map((line): LineChange => {
      const match = ITEM.exec(line.text);
      const start = line.from + (match?.[1]?.length ?? 0);
      const length = (match?.[0].length ?? 0) - (match?.[1]?.length ?? 0);
      return { from: start, to: start + length, insert: "" };
    });
    return { changes, added: false };
  }
  const changes: LineChange[] = [];
  lines.forEach((line, index) => {
    if (line.code) {
      return;
    }
    if (isBlankLine(line)) {
      const before = lines
        .slice(0, index)
        .reverse()
        .find((l) => !isBlankLine(l));
      const after = lines.slice(index + 1).find((l) => !isBlankLine(l));
      if (before && after && !before.code && !after.code && index > 0) {
        changes.push({ from: line.from - 1, to: line.to, insert: "" });
      }
      return;
    }
    if (!ITEM.test(line.text)) {
      const at = line.from + (PREFIX.exec(line.text)?.[0].length ?? 0);
      changes.push({ from: at, to: at, insert: "- " });
    }
  });
  return { changes, added: true };
}

const CODE_NODES = new Set(["FencedCode", "CodeBlock", "Table", "HTMLBlock", "CommentBlock"]);

/**
 * `list.toggleBullets`: bullets on every line the selection touches (a
 * selection ending at a line start leaves that line out), or off when they
 * are all list items already (see `toggleBulletChanges`). A paragraph line
 * right after the new list is separated by a blank line, so it does not
 * become a lazy continuation of the last item.
 */
export const toggleBullets: StateCommand = ({ state, dispatch }) => {
  const numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    let last = state.doc.lineAt(range.to);
    if (!range.empty && range.to === last.from) {
      last = state.doc.lineAt(range.to - 1);
    }
    for (let n = first; n <= last.number; n += 1) {
      numbers.add(n);
    }
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const firstLine = state.doc.line(sorted[0] ?? 1);
  const lastLine = state.doc.line(sorted[sorted.length - 1] ?? 1);
  const code: { from: number; to: number }[] = [];
  const tree = ensureSyntaxTree(state, lastLine.to, 50) ?? syntaxTree(state);
  tree.iterate({
    from: firstLine.from,
    to: lastLine.to,
    enter: (node) => {
      if (CODE_NODES.has(node.name)) {
        code.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
  });
  const lines = sorted.map((n): BulletLine => {
    const line = state.doc.line(n);
    const inCode = code.some((range) => range.from <= line.to && range.to >= line.from);
    return { from: line.from, to: line.to, text: line.text, code: inCode };
  });
  const edit = toggleBulletChanges(lines);
  if (!edit) {
    return false;
  }
  const changes = [...edit.changes];
  if (edit.added && lastLine.number < state.doc.lines) {
    const next = state.doc.line(lastLine.number + 1);
    const nextLine: BulletLine = { from: next.from, to: next.to, text: next.text, code: false };
    if (!isBlankLine(nextLine) && !ITEM.test(next.text) && !numbers.has(next.number)) {
      changes.push({ from: lastLine.to, to: lastLine.to, insert: "\n" });
    }
  }
  const set = state.changes(changes);
  dispatch(
    state.update({
      changes: set,
      selection: state.selection.map(set),
      scrollIntoView: true,
      userEvent: "input.toggleBullets",
    }),
  );
  return true;
};

export const toggleTask: StateCommand = ({ state, dispatch }) => {
  const seen = new Set<number>();
  const changes: LineChange[] = [];
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) {
      if (seen.has(n)) {
        continue;
      }
      seen.add(n);
      const line = state.doc.line(n);
      const change = toggleTaskChange(line.from, line.text);
      if (change) {
        changes.push(change);
      }
    }
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
      userEvent: "input.toggleTask",
    }),
  );
  return true;
};
