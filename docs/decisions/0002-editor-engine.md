# 0002: CodeMirror 6 with live-preview decorations

Date: 2026-10-12. Status: Accepted.

## Context

The editor must be WYSIWYG in the "live preview" sense: markup is visible only
in the line or block being edited. It must handle ~1 MB / 20k-line documents
smoothly and must never reformat the user's markdown.

## Options

| Option                        | Model                                                 | Fidelity                       | Large files                             |
| ----------------------------- | ----------------------------------------------------- | ------------------------------ | --------------------------------------- |
| CodeMirror 6                  | Text buffer + decorations over a Lezer syntax tree    | Exact: the buffer is the file  | Viewport rendering, incremental parsing |
| ProseMirror, Tiptap, Milkdown | Node tree edited as rich text, serialized to markdown | Lossy: reformats on round-trip | Whole-document DOM                      |
| Custom contenteditable        | -                                                     | -                              | -                                       |

## Decision

CodeMirror 6. Live preview is implemented as `ViewPlugin`s that compute
`Decoration.mark` (inline styling), `Decoration.replace` (hidden markup and
block widgets for tables, mermaid, images), limited to visible ranges, with
an "active block" rule that reveals the source of whatever the selection
touches. This is the model Obsidian Live Preview and Zettlr use.

## Consequences

- Tables are edited as raw pipes when active and rendered when inactive;
  in-place cell editing is deferred (see PLAN.md phase 3).
- Any decoration that changes text is a release blocker.
- CodeMirror ships search, history, line editing, and keymaps, which covers
  the VS Code-style editing shortcuts for free.
