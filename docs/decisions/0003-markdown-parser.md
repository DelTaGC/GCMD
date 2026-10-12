# 0003: Lezer-markdown with a GFM spec harness

Date: 2026-10-12. Status: Accepted.

## Context

Live preview needs a syntax tree on every keystroke. GCMD targets the GFM
spec. A parser written from scratch was considered as a valid alternative.

## Options

| Option                                         | Incremental      | GFM coverage                                                         | Where it runs                                                |
| ---------------------------------------------- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `@lezer/markdown` + GFM extension (CodeMirror) | Yes              | Tables, task lists, strikethrough, autolinks; ~95 % CommonMark-exact | Frontend, drives decorations directly                        |
| micromark / remark                             | No               | 100 % GFM                                                            | Frontend; too slow per keystroke on large docs               |
| markdown-it                                    | No               | GFM via plugins                                                      | Frontend; same                                               |
| pulldown-cmark / comrak                        | No               | Full GFM                                                             | Rust backend; IPC per keystroke is too slow for live preview |
| Custom incremental parser                      | Would have to be | What we implement                                                    | Frontend; weeks before a usable editor                       |

## Decision

Lezer-markdown for editing. The GFM spec examples (`tests/fixtures/gfm/`,
672 examples from spec 0.29) are kept in the repo with a harness that reports
pass/fail per section. Deviations are fixed with Lezer extensions where
practical and otherwise listed in `docs/known-deviations.md` (phase 5).

## Consequences

- A separate 100 % compliant parser (micromark or comrak) may be added later
  for HTML export only; it must never drive the editor.
- The harness pass count is tracked; a change that lowers it must say so in
  the commit message.
- The custom-parser option stays open if Lezer deviations prove
  unacceptable; the decoration layer depends only on node names, which keeps
  that swap contained.
