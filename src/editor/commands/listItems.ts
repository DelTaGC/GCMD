/**
 * List item structure commands: Tab / Shift-Tab move a list item (with its
 * children) one nesting level, Backspace at the start of a nested item's
 * text moves it out, and every list command renumbers the ordered lists it
 * touched so numbers follow the column an item lands in.
 *
 * Structure comes from the Lezer tree (it parses an empty `3. ` item as an
 * item, which is what makes Enter then Tab work). Items inside blockquotes
 * are left to the plain indent commands.
 *
 * Numbering rule (`renumberAfter`): an ordered list touched by a command is
 * numbered sequentially from its first item. That first item keeps its
 * number when it already headed a list before the edit (so `5.` lists stay
 * at 5), and starts at 1 when it moved in from elsewhere (a new sub-list).
 * A "lazy" list whose items all repeat the first number (`1. 1. 1.`) keeps
 * repeating it.
 */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  type ChangeSpec,
  type EditorState,
  type Line,
  type StateCommand,
  type Text,
  Transaction,
} from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";

const TAB_SIZE = 4;
/** Parse budget for the post-edit tree; the parse is incremental, so this is rarely hit. */
const PARSE_BUDGET_MS = 50;

interface ItemInfo {
  node: SyntaxNode;
  line: Line;
  /** Column of the marker. */
  indent: number;
  /** Column where the item's text (and its children) start. */
  contentCol: number;
  /** Doc range of the digits of an ordered marker; empty for bullets. */
  numberFrom: number;
  numberTo: number;
  /** `null` for a bullet. */
  number: number | null;
  /** `.` or `)` for ordered items, the bullet character otherwise. */
  delimiter: string;
  /** Last line number of the item, children included. */
  lastLine: number;
}

function column(text: string, upTo: number): number {
  let col = 0;
  for (let i = 0; i < upTo; i += 1) {
    col = text.charAt(i) === "\t" ? col + TAB_SIZE - (col % TAB_SIZE) : col + 1;
  }
  return col;
}

function leadingWhitespace(text: string): number {
  return /^[ \t]*/.exec(text)?.[0].length ?? 0;
}

function treeFor(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS) ?? syntaxTree(state);
}

function describeItem(doc: Text, node: SyntaxNode): ItemInfo | null {
  const mark = node.getChild("ListMark");
  if (!mark) {
    return null;
  }
  const line = doc.lineAt(mark.from);
  const markText = doc.sliceString(mark.from, mark.to);
  const ordered = /^(\d+)([.)])$/.exec(markText);
  const offset = mark.from - line.from;
  const markEnd = mark.to - line.from;
  const after = line.text.slice(markEnd);
  const spaces = leadingWhitespace(after);
  const markEndCol = column(line.text, markEnd);
  const gap = column(line.text, markEnd + spaces) - markEndCol;
  // CommonMark: 1-4 spaces after the marker set the content column; none
  // (empty item) or more than 4 count as one.
  const blankRest = spaces === after.length;
  const contentCol = markEndCol + (blankRest || gap < 1 || gap > 4 ? 1 : gap);
  const digits = ordered?.[1] ?? "";
  return {
    node,
    line,
    indent: column(line.text, offset),
    contentCol,
    numberFrom: mark.from,
    numberTo: mark.from + digits.length,
    number: ordered ? Number(digits) : null,
    delimiter: ordered?.[2] ?? markText,
    lastLine: doc.lineAt(node.to).number,
  };
}

/** The list item whose marker is on `line`, or `null` (blockquotes excluded). */
function itemOnLine(tree: Tree, doc: Text, line: Line): ItemInfo | null {
  const at = line.from + leadingWhitespace(line.text);
  for (let node: SyntaxNode | null = tree.resolveInner(at, 1); node; node = node.parent) {
    if (node.name === "Blockquote") {
      return null;
    }
    if (node.name === "ListItem") {
      const info = describeItem(doc, node);
      return info?.line.number === line.number ? info : null;
    }
  }
  return null;
}

function isList(node: SyntaxNode | null): node is SyntaxNode {
  return node !== null && (node.name === "OrderedList" || node.name === "BulletList");
}

/** The item right before `item` at the same level, across adjacent lists of another kind. */
function previousItem(doc: Text, item: SyntaxNode): ItemInfo | null {
  const before = item.prevSibling;
  if (before?.name === "ListItem") {
    return describeItem(doc, before);
  }
  const listBefore = item.parent?.prevSibling ?? null;
  if (before === null && isList(listBefore) && listBefore.lastChild) {
    return describeItem(doc, listBefore.lastChild);
  }
  return null;
}

function parentItem(doc: Text, item: SyntaxNode): ItemInfo | null {
  const owner = item.parent?.parent ?? null;
  return owner?.name === "ListItem" ? describeItem(doc, owner) : null;
}

/** The last nested list inside `item`, when it is the item's last block. */
function nestedListAtEnd(item: SyntaxNode): SyntaxNode | null {
  const last = item.lastChild;
  return isList(last) ? last : null;
}

function sameKind(a: ItemInfo, b: ItemInfo): boolean {
  return (a.number === null) === (b.number === null) && a.delimiter === b.delimiter;
}

/**
 * Changes that move `item` (all its lines) to `target` and give it `number`.
 * A change in digit count is left to `renumberAfter`, which shifts the
 * item's other lines for every renumbered item alike.
 */
function moveItem(doc: Text, item: ItemInfo, target: number, number: number | null): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  const delta = target - item.indent;
  const digits = number === null ? null : String(number);
  for (let n = item.line.number; n <= item.lastLine; n += 1) {
    const line = doc.line(n);
    const ws = leadingWhitespace(line.text);
    if (ws === line.text.length) {
      continue;
    }
    const col = Math.max(0, column(line.text, ws) + delta);
    changes.push({ from: line.from, to: line.from + ws, insert: " ".repeat(col) });
  }
  if (digits !== null && digits !== doc.sliceString(item.numberFrom, item.numberTo)) {
    changes.push({ from: item.numberFrom, to: item.numberTo, insert: digits });
  }
  return changes;
}

/** Items whose marker line is in the main selection, outermost only. */
function selectedItems(state: EditorState, tree: Tree): ItemInfo[] {
  const { doc } = state;
  const range = state.selection.main;
  const first = doc.lineAt(range.from).number;
  const last = doc.lineAt(range.to).number;
  const items: ItemInfo[] = [];
  let coveredUntil = 0;
  for (let n = first; n <= last; n += 1) {
    if (n <= coveredUntil) {
      continue;
    }
    const item = itemOnLine(tree, doc, doc.line(n));
    if (item) {
      items.push(item);
      coveredUntil = item.lastLine;
    }
  }
  return items;
}

function dispatchChanges(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  changes: ChangeSpec[],
  userEvent: string,
): void {
  const set = state.changes(changes);
  dispatch(
    state.update({
      changes: set,
      selection: state.selection.map(set, 1),
      scrollIntoView: true,
      userEvent,
    }),
  );
}

/**
 * Tab on list items: each becomes the last child of the item before it,
 * aligned with that item's existing children, numbered after them (or 1).
 * The first item of a list cannot move in; Tab is then consumed unchanged.
 * Returns false outside list items so Tab falls through to plain indent.
 */
export const indentListItem: StateCommand = ({ state, dispatch }) => {
  const tree = treeFor(state);
  const { doc } = state;
  const items = selectedItems(state, tree);
  if (items.length === 0) {
    return false;
  }
  const selected = new Set(items.map((item) => item.line.number));
  const nextNumber = new Map<number, number>();
  const changes: ChangeSpec[] = [];
  for (const item of items) {
    // Selected siblings all go under the first unselected item above them.
    let host = previousItem(doc, item.node);
    while (host && selected.has(host.line.number)) {
      host = previousItem(doc, host.node);
    }
    if (!host) {
      continue;
    }
    const nested = nestedListAtEnd(host.node);
    const lastNested = nested?.lastChild ? describeItem(doc, nested.lastChild) : null;
    const target = lastNested ? lastNested.indent : host.contentCol;
    let number: number | null = null;
    if (item.number !== null) {
      const continues = lastNested && sameKind(lastNested, item) ? lastNested.number : null;
      number = nextNumber.get(host.line.number) ?? (continues === null ? 1 : continues + 1);
      nextNumber.set(host.line.number, number + 1);
    }
    changes.push(...moveItem(doc, item, target, number));
  }
  if (changes.length > 0) {
    dispatchChanges(state, dispatch, changes, "input.indent");
  }
  return true;
};

function outdentItems(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  items: ItemInfo[],
): boolean {
  const { doc } = state;
  const nextNumber = new Map<number, number>();
  const changes: ChangeSpec[] = [];
  for (const item of items) {
    const parent = parentItem(doc, item.node);
    if (!parent) {
      continue;
    }
    let number: number | null = null;
    if (item.number !== null) {
      const continues = sameKind(parent, item) ? parent.number : null;
      number = nextNumber.get(parent.line.number) ?? (continues === null ? 1 : continues + 1);
      nextNumber.set(parent.line.number, number + 1);
    }
    changes.push(...moveItem(doc, item, parent.indent, number));
  }
  if (changes.length === 0) {
    return false;
  }
  dispatchChanges(state, dispatch, changes, "delete.dedent");
  return true;
}

/**
 * Shift-Tab on nested list items: each moves out next to its parent item,
 * numbered right after it; the items that followed it become its children.
 * Returns false when no selected item is nested, so plain outdent runs.
 */
export const outdentListItem: StateCommand = ({ state, dispatch }) => {
  const items = selectedItems(state, treeFor(state));
  return items.length > 0 && outdentItems(state, dispatch, items);
};

/**
 * Backspace with the cursor right after a nested item's marker (where its
 * text starts) moves the item out one level, like Shift-Tab. Elsewhere it
 * returns false so the markdown backspace runs.
 */
export const outdentListItemBackward: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) {
    return false;
  }
  const { doc } = state;
  const line = doc.lineAt(range.head);
  const item = itemOnLine(treeFor(state), doc, line);
  if (!item) {
    return false;
  }
  const rest = doc.sliceString(item.numberFrom, line.to);
  const marker = /^(?:\d+[.)]|[-+*])(?:[ \t]+\[[ xX]\])?[ \t]*/.exec(rest)?.[0] ?? "";
  if (range.head !== item.numberFrom + marker.length) {
    return false;
  }
  return outdentItems(state, dispatch, [item]);
};

/** Ordered lists that contain a line touched by `tr`, or hang off a touched item. */
function affectedLists(tree: Tree, doc: Text, tr: Transaction): SyntaxNode[] {
  const lines = new Set<number>();
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const last = doc.lineAt(toB).number;
    for (let n = doc.lineAt(fromB).number; n <= last; n += 1) {
      lines.add(n);
    }
  });
  const lists = new Map<number, SyntaxNode>();
  for (const n of lines) {
    const line = doc.line(n);
    const at = line.from + leadingWhitespace(line.text);
    for (let node: SyntaxNode | null = tree.resolveInner(at, 1); node; node = node.parent) {
      if (node.name === "OrderedList") {
        lists.set(node.from, node);
      }
    }
    const item = itemOnLine(tree, doc, line);
    for (const child of item?.node.getChildren("OrderedList") ?? []) {
      lists.set(child.from, child);
    }
  }
  return [...lists.values()];
}

/** The item on the line of old position `pos`, before the edit. */
function itemBefore(tree: Tree, doc: Text, pos: number): ItemInfo | null {
  return itemOnLine(tree, doc, doc.lineAt(pos));
}

function inBlockquote(node: SyntaxNode): boolean {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (cur.name === "Blockquote") {
      return true;
    }
  }
  return false;
}

/**
 * Renumbering changes (against `tr.state.doc`) for the ordered lists `tr`
 * touched. When a number gets more or fewer digits, the item's other lines
 * shift with it so its children stay nested.
 */
export function renumberAfter(before: EditorState, tr: Transaction): ChangeSpec[] {
  const { doc } = tr.state;
  const tree = treeFor(tr.state);
  const oldTree = treeFor(before);
  const inverse = tr.changes.invert(before.doc);
  const changes: ChangeSpec[] = [];
  for (const list of affectedLists(tree, doc, tr)) {
    const items = list
      .getChildren("ListItem")
      .map((node) => describeItem(doc, node))
      .filter((item): item is ItemInfo => item !== null && item.number !== null);
    const first = items[0]?.number ?? null;
    if (first === null) {
      continue;
    }
    const oldItems = items.map((item) =>
      itemBefore(oldTree, before.doc, inverse.mapPos(item.numberFrom, -1)),
    );
    const start = oldItems[0]?.node.prevSibling?.name === "ListItem" ? 1 : first;
    const repeats = items.filter((item) => item.number === first).length;
    const lazy = items.length >= 2 && repeats >= Math.max(2, items.length - 1);
    const shiftLines = !inBlockquote(list);
    items.forEach((item, index) => {
      const digits = String(lazy ? start : start + index);
      if (digits !== doc.sliceString(item.numberFrom, item.numberTo)) {
        changes.push({ from: item.numberFrom, to: item.numberTo, insert: digits });
      }
      // Width against the item before the edit: the wrapped command may
      // have renumbered it already (the markdown Enter does) or moved it.
      const was = oldItems[index] ?? null;
      const reference = was ?? item;
      const widthDelta = digits.length - (reference.numberTo - reference.numberFrom);
      if (widthDelta === 0 || !shiftLines) {
        return;
      }
      // The old item's lines: a wider number may already have pushed its
      // children out of the item in the new tree.
      const lastLine = was
        ? Math.max(item.lastLine, doc.lineAt(tr.changes.mapPos(was.node.to, 1)).number)
        : item.lastLine;
      for (let n = item.line.number + 1; n <= lastLine; n += 1) {
        const line = doc.line(n);
        const ws = leadingWhitespace(line.text);
        if (ws === line.text.length) {
          continue;
        }
        if (widthDelta > 0) {
          changes.push({ from: line.from, insert: " ".repeat(widthDelta) });
        } else {
          changes.push({ from: line.from, to: line.from + Math.min(ws, -widthDelta) });
        }
      }
    });
  }
  return changes;
}

/** Runs `command`, then renumbers the ordered lists it touched, as one transaction. */
export function withRenumber(command: StateCommand): StateCommand {
  return ({ state, dispatch }) => {
    const captured: { tr?: Transaction } = {};
    const handled = command({
      state,
      dispatch: (tr) => {
        captured.tr = tr;
      },
    });
    const { tr } = captured;
    if (!handled || !tr) {
      return handled;
    }
    const extra = tr.docChanged ? renumberAfter(state, tr) : [];
    if (extra.length === 0) {
      dispatch(tr);
      return true;
    }
    const extraSet = tr.state.changes(extra);
    const userEvent = tr.annotation(Transaction.userEvent);
    dispatch(
      state.update({
        changes: tr.changes.compose(extraSet),
        selection: tr.newSelection.map(extraSet),
        scrollIntoView: tr.scrollIntoView,
        ...(userEvent === undefined ? {} : { userEvent }),
      }),
    );
    return true;
  };
}
