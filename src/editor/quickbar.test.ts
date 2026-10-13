import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { markdownExtension } from "./create";
import {
  QUICKBAR_BUTTONS,
  dismissQuickbar,
  headingCommandAt,
  quickbarState,
  quickbarVisible,
} from "./quickbar";

function stateFor(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
    extensions: [markdownExtension(), quickbarState],
  });
}

describe("quickbar state", () => {
  it("shows only for a non-empty selection", () => {
    expect(quickbarVisible(stateFor("hello world", 3))).toBe(false);
    expect(quickbarVisible(stateFor("hello world", 0, 5))).toBe(true);
  });

  it("positions the tooltip above the selection start", () => {
    const tooltip = stateFor("hello world", 2, 7).field(quickbarState).tooltip;
    expect(tooltip?.pos).toBe(2);
    expect(tooltip?.end).toBe(7);
    expect(tooltip?.above).toBe(true);
  });

  it("is dismissed until the selection changes", () => {
    const shown = stateFor("hello world", 0, 5);
    const dismissed = shown.update({ effects: dismissQuickbar.of(null) }).state;
    expect(quickbarVisible(dismissed)).toBe(false);
    const typed = dismissed.update({ changes: { from: 5, insert: "!" } }).state;
    expect(quickbarVisible(typed)).toBe(false);
    const reselected = typed.update({ selection: EditorSelection.range(0, 3) }).state;
    expect(quickbarVisible(reselected)).toBe(true);
  });

  it("keeps the same field value when nothing relevant changed", () => {
    const shown = stateFor("hello world", 0, 5);
    const next = shown.update({ changes: { from: 11, insert: "!" } }).state;
    expect(next.field(quickbarState)).toBe(shown.field(quickbarState));
  });
});

describe("headingCommandAt", () => {
  it("reports the level of the line at the selection start", () => {
    expect(headingCommandAt(stateFor("## Two\ntext", 0, 3))).toBe("format.heading2");
    expect(headingCommandAt(stateFor("## Two\ntext", 7, 9))).toBe("format.paragraph");
    expect(headingCommandAt(stateFor("#nospace", 0, 2))).toBe("format.paragraph");
  });
});

describe("quickbar buttons", () => {
  it("cover the phase 4 formatting set", () => {
    expect(QUICKBAR_BUTTONS.map((b) => b.command)).toEqual([
      "format.strong",
      "format.emphasis",
      "format.inlineCode",
      "format.strikethrough",
      "format.link",
      "format.clearFormatting",
    ]);
  });
});
