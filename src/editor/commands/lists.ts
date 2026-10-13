/**
 * Task list command: `list.toggleTask` cycles every line touched by the
 * selection the way Obsidian's Ctrl+L does. A plain line becomes `- [ ] `,
 * a list item gains `[ ] `, an open task closes (`[x]`) and a closed one
 * opens again. Lines inside blockquotes keep their `>` prefix.
 */
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
