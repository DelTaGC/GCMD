import { markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { markdownExtension } from "./create";
import { documentPathExtension } from "./document";
import { computeFamily, renderBlocks, collectBlocks } from "./livePreview/decorate";
import { visitHeadings } from "./livePreview/headings";
import { visitInline } from "./livePreview/inline";
import { referenceTarget, type InlineContext } from "./livePreview/inlineDom";
import { TableWidget, visitTableBlocks } from "./livePreview/table";
import { printExtension } from "./print";
import { fileUrl, headingId, printHref, referenceHref } from "./printLinks";
import { stateWith } from "./testing";

const WIN_DOC = "D:\\Dev\\My Notes\\doc.md";

describe("fileUrl", () => {
  it("encodes Windows, POSIX and UNC paths", () => {
    expect(fileUrl(WIN_DOC)).toBe("file:///D:/Dev/My%20Notes/doc.md");
    expect(fileUrl("/home/me/a#b?.md")).toBe("file:///home/me/a%23b%3F.md");
    expect(fileUrl("\\\\server\\share\\a.md")).toBe("file://server/share/a.md");
  });
});

describe("printHref", () => {
  it("keeps web links and completes www. and e-mail autolinks", () => {
    expect(printHref("https://example.com/a?b#c", null)).toBe("https://example.com/a?b#c");
    expect(printHref("www.example.com", null)).toBe("https://www.example.com");
    expect(printHref("me@example.com", null)).toBe("mailto:me@example.com");
    expect(printHref("mailto:me@example.com", null)).toBe("mailto:me@example.com");
  });

  it("keeps heading anchors for in-document jumps", () => {
    expect(printHref("#task-lists", WIN_DOC)).toBe("#task-lists");
    expect(printHref("#", WIN_DOC)).toBeNull();
  });

  it("resolves file paths against the document into file URLs", () => {
    expect(printHref("../PLAN.md", WIN_DOC)).toBe("file:///D:/Dev/PLAN.md");
    expect(printHref("sub/a%20b.md#part", WIN_DOC)).toBe(
      "file:///D:/Dev/My%20Notes/sub/a%20b.md#part",
    );
    expect(printHref("<my file.pdf>", "/home/me/doc.md")).toBe("file:///home/me/my%20file.pdf");
    expect(printHref("C:\\x\\y.md", null)).toBe("file:///C:/x/y.md");
  });

  it("has no target for a relative path in an untitled document or other schemes", () => {
    expect(printHref("../PLAN.md", null)).toBeNull();
    expect(printHref("javascript:alert(1)", WIN_DOC)).toBeNull();
    expect(printHref("ftp://example.com/x", WIN_DOC)).toBeNull();
    expect(printHref("  ", WIN_DOC)).toBeNull();
  });
});

describe("document targets", () => {
  const doc = [
    "# Title",
    "",
    "## Same",
    "",
    "## Same",
    "",
    "Setext one",
    "==========",
    "",
    "[The Spec]: https://spec.example/",
    "[the spec]: https://second.example/",
  ].join("\n");

  it("gives headings their GitHub anchors, repeats numbered", () => {
    const state = stateWith(doc);
    expect(headingId(state, 0)).toBe("title");
    expect(headingId(state, doc.indexOf("## Same"))).toBe("same");
    expect(headingId(state, doc.lastIndexOf("## Same"))).toBe("same-1");
    expect(headingId(state, doc.indexOf("Setext one"))).toBe("setext-one");
    expect(headingId(state, 3)).toBeUndefined();
  });

  it("finds reference definitions case-insensitively, first one wins", () => {
    const state = stateWith(doc);
    expect(referenceHref(state, "the  SPEC")).toBe("https://spec.example/");
    expect(referenceHref(state, "missing")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// What the families emit in print mode

function printState(doc: string, path: string | null = WIN_DOC, printing = true): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [markdownExtension(), documentPathExtension(path), printExtension(printing)],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

interface MarkSpec {
  tagName?: string;
  class?: string;
  attributes?: Record<string, string>;
}

/** `[text, href]` of every `<a>` mark a family emits. */
function anchors(state: EditorState, visit: typeof visitInline): [string, string][] {
  const out = computeFamily(state, [{ from: 0, to: state.doc.length }], visit);
  const found: [string, string][] = [];
  const iter = out.decorations.iter();
  while (iter.value) {
    const spec = iter.value.spec as MarkSpec;
    if (spec.tagName === "a") {
      found.push([state.doc.sliceString(iter.from, iter.to), spec.attributes?.["href"] ?? ""]);
    }
    iter.next();
  }
  return found;
}

describe("print mode links", () => {
  const doc = [
    "# Top",
    "",
    "[web](https://example.com) [jump](#top) [file](../PLAN.md) <https://auto.example>",
    "www.bare.example and [ref text][gfm] and [gfm][] and [odd](ftp://x.y/z)",
    "",
    "[gfm]: https://github.github.com/gfm/",
  ].join("\n");

  it("turns every kind of link into an anchor with its target", () => {
    expect(anchors(printState(doc), visitInline)).toEqual([
      ["web", "https://example.com"],
      ["jump", "#top"],
      ["file", "file:///D:/Dev/PLAN.md"],
      ["https://auto.example", "https://auto.example"],
      ["www.bare.example", "https://www.bare.example"],
      ["ref text", "https://github.github.com/gfm/"],
      ["gfm", "https://github.github.com/gfm/"],
    ]);
  });

  it("emits no anchors on screen", () => {
    expect(anchors(printState(doc, WIN_DOC, false), visitInline)).toEqual([]);
  });

  it("puts the anchor id on heading lines only while printing", () => {
    const ids = (state: EditorState): (string | undefined)[] => {
      const out = computeFamily(state, [{ from: 0, to: state.doc.length }], visitHeadings);
      const found: (string | undefined)[] = [];
      const iter = out.decorations.iter();
      while (iter.value) {
        if (iter.from === iter.to) {
          found.push((iter.value.spec as MarkSpec).attributes?.["id"]);
        }
        iter.next();
      }
      return found;
    };
    expect(ids(printState(doc))).toEqual(["top"]);
    expect(ids(printState(doc, WIN_DOC, false))).toEqual([undefined]);
  });

  it("rebuilds table widgets for printing", () => {
    // The cursor (position 0) is outside the table, so it renders on screen too.
    const table = "start\n\n| a |\n| - |\n| [x](https://example.com) |\n\nend";
    const widgetOf = (state: EditorState): TableWidget => {
      const blocks = collectBlocks(state, visitTableBlocks);
      expect(renderBlocks(state, blocks).size).toBe(1);
      const widget = blocks[0]?.widget;
      if (!(widget instanceof TableWidget)) {
        throw new Error("no table widget");
      }
      return widget;
    };
    const screen = widgetOf(printState(table, WIN_DOC, false));
    const print = widgetOf(printState(table));
    expect(print.printing).toBe(true);
    expect(screen.printing).toBe(false);
    expect(print.eq(screen)).toBe(false);
  });
});

describe("review cases", () => {
  it("does not treat a link with an empty destination as a reference", () => {
    const doc = "[spec]() and [spec][] here\n\n[spec]: https://spec.example/";
    expect(anchors(printState(doc), visitInline)).toEqual([["spec", "https://spec.example/"]]);
  });

  it("resolves reference links inside table cells through the document", () => {
    const state = printState("[gfm]: https://github.github.com/gfm/");
    const ctx: InlineContext = {
      documentPath: null,
      onLayout: (): void => undefined,
      printHref: (href: string): string | null => printHref(href, null),
      referenceHref: (label: string): string | undefined => referenceHref(state, label),
    };
    const target = (cell: string, context: InlineContext = ctx): string => {
      const link = markdownLanguage.parser.parse(cell).topNode.firstChild?.getChild("Link");
      if (!link) {
        throw new Error(`no link in ${cell}`);
      }
      return referenceTarget(cell, link, context);
    };
    expect(target("see [the spec][GFM]")).toBe("https://github.github.com/gfm/");
    expect(target("see [gfm][]")).toBe("https://github.github.com/gfm/");
    expect(target("see [the spec][nope]")).toBe("");
    expect(target("see [gfm]()")).toBe("");
    // On screen cells carry no reference lookup.
    expect(target("see [gfm][]", { ...ctx, printHref: null, referenceHref: null })).toBe("");
  });
});
