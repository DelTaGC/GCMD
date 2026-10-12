import { type EditorState, type StateCommand, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { stateWith } from "../testing";
import {
  insertLink,
  toggleEmphasis,
  toggleInlineCode,
  toggleStrikethrough,
  toggleStrong,
} from "./format";
import { setHeadingLevel } from "./headings";

interface Result {
  doc: string;
  from: number;
  to: number;
  ran: boolean;
}

function apply(command: StateCommand, state: EditorState): Result {
  let next = state;
  const ran = command({
    state,
    dispatch: (tr: Transaction) => {
      next = tr.state;
    },
  });
  const { from, to } = next.selection.main;
  return { doc: next.doc.toString(), from, to, ran };
}

describe("toggleStrong", () => {
  it("wraps a selection and keeps the text selected", () => {
    const r = apply(toggleStrong, stateWith("hello world", { anchor: 0, head: 5 }));
    expect(r.doc).toBe("**hello** world");
    expect([r.from, r.to]).toEqual([2, 7]);
  });

  it("wraps the word at an empty cursor", () => {
    const r = apply(toggleStrong, stateWith("hello world", 8));
    expect(r.doc).toBe("hello **world**");
  });

  it("inserts an empty pair when there is no word", () => {
    const r = apply(toggleStrong, stateWith("a  b", 2));
    expect(r.doc).toBe("a **** b");
    expect([r.from, r.to]).toEqual([4, 4]);
  });

  it("unwraps when the cursor is inside a strong node", () => {
    const r = apply(toggleStrong, stateWith("say **hello** now", 8));
    expect(r.doc).toBe("say hello now");
    expect([r.from, r.to]).toEqual([6, 6]);
  });

  it("unwraps a selection that covers the strong content", () => {
    const r = apply(toggleStrong, stateWith("**hi**", { anchor: 2, head: 4 }));
    expect(r.doc).toBe("hi");
    expect([r.from, r.to]).toEqual([0, 2]);
  });

  it("does not confuse strong with emphasis", () => {
    const r = apply(toggleEmphasis, stateWith("**bold**", 4));
    expect(r.doc).toBe("***bold***");
  });
});

describe("other toggles", () => {
  it("toggles emphasis, inline code and strikethrough", () => {
    expect(apply(toggleEmphasis, stateWith("word", 1)).doc).toBe("*word*");
    expect(apply(toggleInlineCode, stateWith("word", 1)).doc).toBe("`word`");
    expect(apply(toggleStrikethrough, stateWith("word", 1)).doc).toBe("~~word~~");
    expect(apply(toggleInlineCode, stateWith("`word`", 2)).doc).toBe("word");
    expect(apply(toggleStrikethrough, stateWith("~~word~~", 3)).doc).toBe("word");
  });
});

describe("insertLink", () => {
  it("uses a selected URL as destination", () => {
    const r = apply(insertLink, stateWith("see https://x.y", { anchor: 4, head: 15 }));
    expect(r.doc).toBe("see [](https://x.y)");
    expect([r.from, r.to]).toEqual([5, 5]);
  });

  it("uses selected text and selects the url placeholder", () => {
    const r = apply(insertLink, stateWith("see here", { anchor: 4, head: 8 }));
    expect(r.doc).toBe("see [here](url)");
    expect(r.doc.slice(r.from, r.to)).toBe("url");
  });

  it("inserts a template at an empty cursor", () => {
    const r = apply(insertLink, stateWith("", 0));
    expect(r.doc).toBe("[text](url)");
    expect(r.doc.slice(r.from, r.to)).toBe("text");
  });
});

describe("setHeadingLevel", () => {
  it("adds, replaces and removes ATX prefixes", () => {
    expect(apply(setHeadingLevel(2), stateWith("Title", 3)).doc).toBe("## Title");
    expect(apply(setHeadingLevel(1), stateWith("### Title", 5)).doc).toBe("# Title");
    expect(apply(setHeadingLevel(0), stateWith("### Title", 5)).doc).toBe("Title");
  });

  it("keeps the cursor on the same text", () => {
    const r = apply(setHeadingLevel(3), stateWith("Title", 2));
    expect([r.from, r.to]).toEqual([6, 6]);
  });

  it("applies to every line of a selection", () => {
    const r = apply(setHeadingLevel(2), stateWith("a\nb\nc", { anchor: 0, head: 5 }));
    expect(r.doc).toBe("## a\n## b\n## c");
  });

  it("returns false when nothing changes", () => {
    expect(apply(setHeadingLevel(0), stateWith("plain", 0)).ran).toBe(false);
  });
});
