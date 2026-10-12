import { describe, expect, it } from "vitest";
import { normalizeHtml } from "./normalize";

describe("normalizeHtml", () => {
  it("collapses whitespace and ignores whitespace around block tags", () => {
    expect(normalizeHtml("<ul>\n<li>a   b</li>\n</ul>\n")).toBe(
      normalizeHtml("<ul><li>a b</li></ul>"),
    );
  });

  it("keeps whitespace inside pre blocks", () => {
    expect(normalizeHtml("<pre><code>a  b\n</code></pre>")).not.toBe(
      normalizeHtml("<pre><code>a b\n</code></pre>"),
    );
  });

  it("lowercases tags and sorts attributes", () => {
    expect(normalizeHtml('<A TITLE="t" href="/u">x</A>')).toBe('<a href="/u" title="t">x</a>');
  });

  it("unifies void tag spelling", () => {
    const expected = '<p>a<br />b<img alt="x" src="/p" /></p>';
    expect(normalizeHtml('<p>a<br>b<img src="/p" alt="x"></p>')).toBe(expected);
    expect(normalizeHtml('<p>a<br/>b<img src="/p" alt="x"/></p>')).toBe(expected);
  });

  it("decodes entities in text and attributes", () => {
    expect(normalizeHtml("<p>it&#x27;s &quot;q&quot;</p>")).toBe(normalizeHtml('<p>it\'s "q"</p>'));
    expect(normalizeHtml('<a href="/a&amp;b">x</a>')).toBe(
      normalizeHtml('<a href="/a&#38;b">x</a>'),
    );
  });
});
