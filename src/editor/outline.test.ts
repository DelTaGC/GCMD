import { describe, expect, it } from "vitest";
import { activeHeading, buildOutline, collectHeadings, sameHeadings } from "./outline";
import { stateWith } from "./testing";

const DOC = [
  "# Title",
  "",
  "intro",
  "",
  "## Section *one*",
  "",
  "### Sub **bold** `code` [link](http://x) \\*lit\\*",
  "",
  "Setext",
  "------",
  "",
  "```",
  "# not a heading",
  "```",
  "",
  "> ## Quoted",
  "",
  "## Section two ##",
  "",
  "#hashtag without space is a paragraph.",
].join("\n");

describe("collectHeadings", () => {
  const headings = collectHeadings(stateWith(DOC));

  it("finds ATX and setext headings in order, skipping fences and false positives", () => {
    expect(headings.map((h) => `${String(h.level)}:${h.text}`)).toEqual([
      "1:Title",
      "2:Section one",
      "3:Sub bold code link *lit*",
      "2:Setext",
      "2:Quoted",
      "2:Section two",
    ]);
  });

  it("records positions at the start of the heading line", () => {
    expect(headings[0]?.from).toBe(0);
    expect(DOC.slice(headings[3]?.from, headings[3]?.to)).toBe("Setext\n------");
    expect(DOC.slice(headings[5]?.from, headings[5]?.to)).toBe("## Section two ##");
  });

  it("returns nothing for a document without headings", () => {
    expect(collectHeadings(stateWith("just text\n\nmore"))).toEqual([]);
  });
});

describe("buildOutline", () => {
  it("nests by level and closes deeper levels", () => {
    const headings = collectHeadings(stateWith(DOC));
    const tree = buildOutline(headings);
    const shape = (nodes: ReturnType<typeof buildOutline>): unknown =>
      nodes.map((n) => [n.heading.text, shape(n.children)]);
    expect(shape(tree)).toEqual([
      [
        "Title",
        [
          ["Section one", [["Sub bold code link *lit*", []]]],
          ["Setext", []],
          ["Quoted", []],
          ["Section two", []],
        ],
      ],
    ]);
    expect(tree[0]?.children[0]?.children[0]?.index).toBe(2);
  });

  it("nests skipped levels directly and keeps a lower heading at the top", () => {
    const headings = collectHeadings(stateWith("### Deep\n\n# Top\n\n## Child\n"));
    const tree = buildOutline(headings);
    expect(tree.map((n) => n.heading.text)).toEqual(["Deep", "Top"]);
    expect(tree[1]?.children.map((n) => n.heading.text)).toEqual(["Child"]);
  });
});

describe("activeHeading", () => {
  const headings = collectHeadings(stateWith(DOC));

  it("is -1 before the first heading and the last heading at or before the cursor", () => {
    expect(activeHeading([], 5)).toBe(-1);
    expect(activeHeading(headings, 0)).toBe(0);
    expect(activeHeading(headings, 3)).toBe(0);
    const two = headings[5];
    expect(two).toBeDefined();
    if (two) {
      expect(activeHeading(headings, two.from - 1)).toBe(4);
      expect(activeHeading(headings, two.from)).toBe(5);
      expect(activeHeading(headings, DOC.length)).toBe(5);
    }
  });
});

describe("sameHeadings", () => {
  it("compares level, text and positions", () => {
    const a = collectHeadings(stateWith("# A\n\n## B\n"));
    expect(sameHeadings(a, collectHeadings(stateWith("# A\n\n## B\n")))).toBe(true);
    expect(sameHeadings(a, collectHeadings(stateWith("# A\n\n## C\n")))).toBe(false);
    expect(sameHeadings(a, collectHeadings(stateWith("# A\n\n\n## B\n")))).toBe(false);
    expect(sameHeadings(a, a.slice(1))).toBe(false);
  });
});
