/**
 * Heading level commands: set every line touched by the selection to an ATX
 * heading of the given level, or back to a paragraph with level 0. Existing
 * `#` prefixes are replaced, never stacked.
 */
import type { EditorState, StateCommand } from "@codemirror/state";

const ATX_PREFIX = /^( {0,3})(#{1,6})([ \t]+|$)/;

export type HeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The ATX heading level of the line containing `pos`; 0 for anything else. */
export function headingLevelAt(state: EditorState, pos: number): HeadingLevel {
  const match = ATX_PREFIX.exec(state.doc.lineAt(pos).text);
  return match ? ((match[2]?.length ?? 0) as HeadingLevel) : 0;
}

export function setHeadingLevel(level: HeadingLevel): StateCommand {
  return ({ state, dispatch }) => {
    const seen = new Set<number>();
    const changes: { from: number; to: number; insert: string }[] = [];
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number;
      const last = state.doc.lineAt(range.to).number;
      for (let n = first; n <= last; n += 1) {
        if (seen.has(n)) {
          continue;
        }
        seen.add(n);
        const line = state.doc.line(n);
        const match = ATX_PREFIX.exec(line.text);
        const prefixLength = match ? match[0].length : 0;
        const insert = level === 0 ? "" : `${"#".repeat(level)} `;
        if (prefixLength === 0 && insert === "") {
          continue;
        }
        changes.push({ from: line.from, to: line.from + prefixLength, insert });
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
        userEvent: "input.format",
      }),
    );
    return true;
  };
}
