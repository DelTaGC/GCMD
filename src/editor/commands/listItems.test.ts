import { deleteMarkupBackward, insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import type { EditorState, StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stateWith } from "../testing";
import {
  indentListItem,
  outdentListItem,
  outdentListItemBackward,
  withRenumber,
} from "./listItems";

interface Result {
  doc: string;
  head: number;
  handled: boolean;
}

/** Runs `command` with the cursor at the `|` in `doc` (the bar is removed). */
function apply(command: StateCommand, doc: string): Result {
  const at = doc.indexOf("|");
  let state: EditorState = stateWith(doc.replace("|", ""), at);
  const handled = command({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  return { doc: state.doc.toString(), head: state.selection.main.head, handled };
}

/** The resulting document with the cursor marked by `|`. */
function after(command: StateCommand, doc: string): string {
  const r = apply(command, doc);
  return `${r.doc.slice(0, r.head)}|${r.doc.slice(r.head)}`;
}

const tab = withRenumber(indentListItem);
const shiftTab = withRenumber(outdentListItem);
const enter = withRenumber(insertNewlineContinueMarkup);
const backspace: StateCommand = (target) =>
  withRenumber(outdentListItemBackward)(target) || withRenumber(deleteMarkupBackward)(target);

describe("indentListItem", () => {
  it("nests a new item under the previous one and restarts at 1", () => {
    expect(after(tab, "1. first\n2. second\n3. |\n4. next\n")).toBe(
      "1. first\n2. second\n   1. |\n3. next\n",
    );
  });

  it("fixes a 2-space indent that did not nest", () => {
    expect(after(tab, "1. first\n2. second\n  3. |bad\n4. next\n")).toBe(
      "1. first\n2. second\n   1. |bad\n3. next\n",
    );
  });

  it("continues the numbering of existing children", () => {
    expect(after(tab, "1. a\n   1. b\n   2. c\n2. |d\n3. e\n")).toBe(
      "1. a\n   1. b\n   2. c\n   3. |d\n2. e\n",
    );
  });

  it("aligns with the existing children's column", () => {
    expect(after(tab, "- a\n    - b\n- |c\n")).toBe("- a\n    - b\n    - |c\n");
  });

  it("moves the item's children along", () => {
    expect(after(tab, "1. a\n2. |b\n   1. c\n3. d\n")).toBe("1. a\n   1. |b\n      1. c\n2. d\n");
  });

  it("nests bullets under the item's text column", () => {
    expect(after(tab, "- a\n- |b\n")).toBe("- a\n  - |b\n");
    expect(after(tab, "10. a\n11. |b\n")).toBe("10. a\n    1. |b\n");
  });

  it("consumes Tab on a first item without changing it", () => {
    const r = apply(tab, "1. |a\n2. b\n");
    expect(r).toEqual({ doc: "1. a\n2. b\n", head: 3, handled: true });
  });

  it("falls through outside list items", () => {
    expect(apply(tab, "para|graph\n").handled).toBe(false);
    expect(apply(tab, "> 1. a\n> 2. |b\n").handled).toBe(false);
  });

  it("moves selected siblings together under one parent", () => {
    const doc = "1. a\n2. b\n3. c\n4. d\n";
    let state: EditorState = stateWith(doc, { anchor: 5, head: 14 });
    tab({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
    expect(state.doc.toString()).toBe("1. a\n   1. b\n   2. c\n2. d\n");
  });
});

describe("outdentListItem", () => {
  it("moves a nested item out after its parent and renumbers both lists", () => {
    expect(after(shiftTab, "1. a\n2. b\n   1. |\n3. c\n")).toBe("1. a\n2. b\n3. |\n4. c\n");
  });

  it("makes the following siblings its children, restarting at 1", () => {
    expect(after(shiftTab, "1. a\n   1. b\n   2. |c\n   3. d\n2. e\n")).toBe(
      "1. a\n   1. b\n2. |c\n   1. d\n3. e\n",
    );
  });

  it("returns false for a top-level item", () => {
    expect(apply(shiftTab, "1. |a\n").handled).toBe(false);
  });

  it("outdents a bullet nested in an ordered item", () => {
    expect(after(shiftTab, "1. a\n   - |b\n2. c\n")).toBe("1. a\n- |b\n2. c\n");
  });
});

describe("outdentListItemBackward", () => {
  it("moves an empty nested item out", () => {
    expect(after(backspace, "1. a\n2. b\n   1. |\n3. c\n")).toBe("1. a\n2. b\n3. |\n4. c\n");
  });

  it("moves a nested item with text out when the cursor is at its start", () => {
    expect(after(backspace, "- a\n  - [ ] |task\n")).toBe("- a\n- [ ] |task\n");
  });

  it("leaves other positions to the markdown backspace", () => {
    expect(apply(outdentListItemBackward, "1. a\n   1. t|ext\n").handled).toBe(false);
    expect(apply(outdentListItemBackward, "1. |a\n").handled).toBe(false);
  });

  it("renumbers after the markdown backspace removes a marker", () => {
    expect(after(backspace, "1. a\n2. |b\n3. c\n")).toBe("1. a\n   |b\n2. c\n");
  });
});

describe("withRenumber around Enter", () => {
  it("renumbers the following items even past a gap", () => {
    expect(after(enter, "1. a|\n2. b\n5. c\n")).toBe("1. a\n2. |\n3. b\n4. c\n");
  });

  it("keeps the start number of a list", () => {
    expect(after(enter, "5. |a\n6. b\n")).toBe("5.\n6. |a\n7. b\n");
  });

  it("keeps lazy numbering", () => {
    expect(after(enter, "1. a\n1. b|\n")).toBe("1. a\n1. b\n1. |\n");
  });

  it("shifts an item's children when its number gains a digit", () => {
    expect(after(enter, "8. a|\n9. b\n   - c\n")).toBe("8. a\n9. |\n10. b\n    - c\n");
  });

  it("leaves non-list lines alone", () => {
    expect(apply(enter, "para|\n").handled).toBe(false);
  });
});
