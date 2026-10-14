# Known deviations from the GFM spec

The editor's parser is `@lezer/markdown` (ADR 0003). The harness in
`src/spec/gfm-spec.test.ts` renders all 672 examples of GFM spec 0.29 through
the Lezer tree and gates on an explicit list: every example must pass unless
it is listed in `KNOWN_FAILURES`, and every listed example must still fail,
so an upstream fix shows up as a test failure and the entry is removed.
This file explains the entries. Current count: 652 of 672 pass, 20 listed.

Each row says what the editor shows for the construct, since the live
preview reads the same tree. "Cosmetic" means only the harness's HTML
differs; the editor renders the text correctly.

| Example  | Section               | Lezer behaviour                                                                                      | Effect in GCMD                                                                               | Status                                 |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| 5, 6, 7  | Tabs                  | A tab partially consumed by a list or quote prefix is not kept as the remaining spaces of code text. | Cosmetic: the code block is recognised, only its leading columns differ in the harness HTML. | Accepted (rare, tab-indented code).    |
| 10       | Tabs                  | `#\tFoo`: a tab after the `#` is not accepted as the ATX heading separator.                          | The line is shown as a paragraph, not a heading. Type a space after `#`.                     | Accepted; candidate for a block parser |
| 82       | Indented code blocks  | A whitespace-only line inside indented code loses its spaces.                                        | Cosmetic.                                                                                    | Accepted.                              |
| 237      | List items            | `>>` with no space before a list item makes the next line a lazy continuation.                       | Nested quote content merges into one paragraph; a space after `>` fixes it.                  | Accepted (rare).                       |
| 258      | List items            | An empty item `-` followed by a blank line and an indented paragraph swallows the paragraph.         | The paragraph is shown as list content.                                                      | Accepted (rare).                       |
| 502      | Links                 | `[link](<foo\>)`: a backslash before the closing `>` is accepted as a destination.                   | Shown as a link to `foo\`.                                                                   | Accepted (rare).                       |
| 520, 536 | Links                 | Two levels of nested brackets in link text (`[a [b [c]]](u)`) are not parsed.                        | Shown as plain text.                                                                         | Accepted (rare).                       |
| 531      | Links                 | `*foo [bar* baz]`: emphasis may not cross an unmatched `[`.                                          | Shown as plain text.                                                                         | Accepted (rare).                       |
| 577, 579 | Links                 | `[foo][bar][baz]` is paired left to right; the parser does not know the definitions.                 | `[foo][bar]` is treated as the link, `[baz]` as a second one.                                | Inherent to a definition-free parser.  |
| 610      | Autolinks             | A bare URL right after `<` is autolinked (`<http://a.b/c bim>`).                                     | The URL inside is clickable; harmless.                                                       | Accepted.                              |
| 616, 619 | Autolinks             | The CommonMark examples expect bare URLs to stay text; the GFM autolink extension is always on.      | Bare URLs are links, which is what GitHub does too.                                          | By design.                             |
| 620      | Autolinks             | Same for a bare e-mail address.                                                                      | E-mail addresses are `mailto:` links.                                                        | By design.                             |
| 628      | Autolinks (extension) | `ftp://` is not an extended autolink scheme in Lezer (http, https, www, mailto only).                | `ftp://` URLs are plain text.                                                                | Accepted.                              |
| 644      | Raw HTML              | `--` inside an HTML comment is rejected (HTML5 allows it since spec 0.31; Lezer follows 0.30 rules). | The comment is shown as text.                                                                | Accepted.                              |
| 645      | Raw HTML              | `<!-->` is a comment in the spec but not in Lezer.                                                   | Shown as text.                                                                               | Accepted (rare).                       |

## Harness-only fixes

Deviations that were in the renderer rather than in the tree are fixed in
`src/spec/render.ts` and no longer listed. Example 553 (`[bar][foo\!]`) was
the last one: Lezer parses nothing inside an unresolved reference label, so
the renderer resolves the label's backslash escapes itself.

## Updating this list

1. Run `npx vitest run src/spec/gfm-spec.test.ts`. A failing "passes every
   example that is not a known deviation" test names new regressions; a
   failing "still fails every listed known deviation" test names entries to
   delete here and in `KNOWN_FAILURES`.
2. After bumping `@lezer/markdown`, expect entries to disappear; remove them
   and note the new count above.
3. A fix for an entry marked "candidate" is a Lezer block or inline parser
   extension in `src/editor/`, registered in `markdownExtension()`.

## Beyond the spec: Mermaid

Mermaid's ELK layouts (`layout: elk` in the diagram config, `flowchart-elk`)
are not available: their engine `elkjs` is EPL-2.0, which GCMD
(GPL-3.0-or-later) cannot ship (ADR 0011). Such a diagram shows "The ELK
layout is not available in GCMD" in its widget; remove the `layout` setting
to get the default dagre layout. All other diagram types and layouts work.
