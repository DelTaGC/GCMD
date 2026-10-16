import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { markdownExtension } from "./create";
import { alignCommandAt, dismissTableBar, tableBar, tableBarVisible } from "./tableBar";

const DOC = "before\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n\nafter";

function stateAt(anchor: number, head = anchor): EditorState {
  const state = EditorState.create({
    doc: DOC,
    extensions: [markdownExtension(), tableBar],
    selection: EditorSelection.range(anchor, head),
  });
  ensureSyntaxTree(state, DOC.length, 5000);
  return state;
}

describe("table bar", () => {
  it("shows for a cursor inside a table and nowhere else", () => {
    expect(tableBarVisible(stateAt(10))).toBe(true);
    expect(tableBarVisible(stateAt(2))).toBe(false);
    expect(tableBarVisible(stateAt(DOC.length))).toBe(false);
  });

  it("stays while a cell's content is selected (Tab, Enter)", () => {
    expect(tableBarVisible(stateAt(10, 11))).toBe(true);
  });

  it("stays dismissed while the cursor stays in that table, then comes back", () => {
    let state = stateAt(10);
    state = state.update({ effects: dismissTableBar.of(null) }).state;
    expect(tableBarVisible(state)).toBe(false);
    state = state.update({ selection: EditorSelection.cursor(30) }).state;
    expect(tableBarVisible(state)).toBe(false);
    state = state.update({ changes: { from: 30, insert: "x" } }).state;
    expect(tableBarVisible(state)).toBe(false);
    state = state.update({ selection: EditorSelection.cursor(2) }).state;
    expect(tableBarVisible(state)).toBe(false);
    state = state.update({ selection: EditorSelection.cursor(10) }).state;
    expect(tableBarVisible(state)).toBe(true);
  });

  it("reports the alignment command of the current column", () => {
    expect(alignCommandAt(stateAt(10))).toBe("table.alignColumnLeft");
    expect(alignCommandAt(stateAt(14))).toBe("table.alignColumnRight");
    expect(alignCommandAt(stateAt(2))).toBe("table.alignColumnNone");
  });
});
