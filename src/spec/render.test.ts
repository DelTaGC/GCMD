import { describe, expect, it } from "vitest";
import { renderToHtml } from "./render";

describe("renderToHtml", () => {
  it("renders paragraphs with soft breaks", () => {
    expect(renderToHtml("one\ntwo\n\nthree\n")).toBe("<p>one\ntwo</p>\n<p>three</p>\n");
  });

  it("renders ATX and setext headings", () => {
    expect(renderToHtml("# One #\n\nTwo\n---\n")).toBe("<h1>One</h1>\n<h2>Two</h2>\n");
  });

  it("renders tight lists without paragraphs", () => {
    expect(renderToHtml("- a\n- b\n")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n");
  });

  it("renders loose lists with paragraphs", () => {
    expect(renderToHtml("- a\n\n- b\n")).toBe(
      "<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n",
    );
  });

  it("emits the start attribute of ordered lists", () => {
    expect(renderToHtml("3. a\n4. b\n")).toBe('<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>\n');
  });

  it("strips quote marks from continuation lines of nested blockquotes", () => {
    expect(renderToHtml("> > a\n> > b\n")).toBe(
      "<blockquote>\n<blockquote>\n<p>a\nb</p>\n</blockquote>\n</blockquote>\n",
    );
  });

  it("renders fenced code with the first word of the info string", () => {
    expect(renderToHtml("```ts extra\nconst a = 1;\n```\n")).toBe(
      '<pre><code class="language-ts">const a = 1;\n</code></pre>\n',
    );
  });

  it("renders indented code", () => {
    expect(renderToHtml("    <b>\n")).toBe("<pre><code>&lt;b&gt;\n</code></pre>\n");
  });

  it("renders inline links with titles and escapes attributes", () => {
    expect(renderToHtml('[a](/u?x=1&y=2 "t \\"q\\"")\n')).toBe(
      '<p><a href="/u?x=1&amp;y=2" title="t &quot;q&quot;">a</a></p>\n',
    );
  });

  it("resolves reference links case-insensitively", () => {
    expect(renderToHtml("[Foo Bar][foo  bar] and [foo bar]\n\n[FOO BAR]: /url 'T'\n")).toBe(
      '<p><a href="/url" title="T">Foo Bar</a> and <a href="/url" title="T">foo bar</a></p>\n',
    );
  });

  it("renders images with alt text and percent-encodes destinations", () => {
    expect(renderToHtml("![a *b*](</my pic.png>)\n")).toBe(
      '<p><img src="/my%20pic.png" alt="a b" /></p>\n',
    );
  });

  it("renders autolinks, www and email forms", () => {
    expect(renderToHtml("<http://a.b/c> www.example.com me@example.com\n")).toBe(
      '<p><a href="http://a.b/c">http://a.b/c</a> <a href="http://www.example.com">www.example.com</a> ' +
        '<a href="mailto:me@example.com">me@example.com</a></p>\n',
    );
  });

  it("decodes named and numeric entities, leaving unknown names literal", () => {
    expect(renderToHtml("&copy; &#35; &#x22; &bogus;\n")).toBe("<p>© # &quot; &amp;bogus;</p>\n");
  });

  it("renders tables with alignment from the delimiter row", () => {
    expect(renderToHtml("| a | b |\n|:-:|--:|\n| 1 | 2 |\n")).toBe(
      '<table>\n<thead>\n<tr>\n<th align="center">a</th>\n<th align="right">b</th>\n</tr>\n</thead>\n' +
        '<tbody>\n<tr>\n<td align="center">1</td>\n<td align="right">2</td>\n</tr>\n</tbody>\n</table>\n',
    );
  });

  it("renders task list items", () => {
    expect(renderToHtml("- [ ] a\n- [x] b\n")).toBe(
      '<ul>\n<li><input disabled="" type="checkbox" /> a</li>\n' +
        '<li><input checked="" disabled="" type="checkbox" /> b</li>\n</ul>\n',
    );
  });

  it("renders hard breaks", () => {
    expect(renderToHtml("a\\\nb  \nc\n")).toBe("<p>a<br />\nb<br />\nc</p>\n");
  });

  it("renders backslash escapes and emphasis, strong, strikethrough and code", () => {
    expect(renderToHtml("\\*x\\* *e* **s** ~~d~~ `c<`\n")).toBe(
      "<p>*x* <em>e</em> <strong>s</strong> <del>d</del> <code>c&lt;</code></p>\n",
    );
  });

  it("filters disallowed raw HTML only when asked", () => {
    expect(renderToHtml("a <script> b\n")).toBe("<p>a <script> b</p>\n");
    expect(renderToHtml("a <script> b\n", { tagfilter: true })).toBe("<p>a &lt;script> b</p>\n");
  });
});
