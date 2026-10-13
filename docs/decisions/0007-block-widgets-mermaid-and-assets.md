# 0007: Block widgets, lazy mermaid, local assets through the asset protocol

Date: 2026-10-13. Status: Accepted.

## Context

Phase 3 renders tables and mermaid diagrams as single widgets spanning
several lines, draws local images inline, and lets Ctrl+click open links.
Three choices had to be made: how multi-line widgets fit the view-plugin
architecture of phase 2, which diagram library to use and how to keep it out
of the startup bundle, and how the webview may read image files next to the
document without a broad filesystem permission.

## Decision

- **Block widgets come from state fields, not view plugins.** CodeMirror
  refuses block decorations and replacements that cover line breaks from a
  `ViewPlugin`. `livePreview/decorate.ts` therefore has two family kinds:
  `livePreviewFamily` (view plugin, visible ranges, inline work) and
  `blockFamily` (state field over the whole document). A block family's
  visitor records every candidate block once per document or tree change;
  a selection change only re-applies the active-block rule to the cached
  list, so it never re-walks the tree. Block ranges are published through the
  `blockRanges` facet so `cursor.lineDown` / `cursor.lineUp` can step into a
  widget that CodeMirror's own vertical motion would skip.
- **Mermaid via `mermaid` (v12), dynamic `import()` only.** First diagram
  loads the library; results are cached by a 53-bit content hash of
  source plus theme; renders are serialized because mermaid holds global
  configuration; `securityLevel: "strict"` so the SVG is sanitized before it
  is inserted with `innerHTML`. Errors render inline in the widget.
- **Table cells are rendered to DOM from a Lezer parse of the cell text**
  (`inlineDom.ts`), never through `innerHTML`.
- **Local images use Tauri's `asset:` protocol with a per-file runtime
  scope.** `assetProtocol.enable` is on with an empty static scope; the
  `resolve_asset` command resolves the href against the document, checks the
  file exists, and calls `allow_file` for that one path. No `fs` plugin, no
  `**` scope. Remote images are not loaded at all.
- **Links**: `opener:default` (http, https, mailto, tel) for web links;
  `.md` links spawn a new GCMD process via the existing `open_new_window`.
  Other file links are ignored rather than granting `open-path`.
- **Code fence languages** stay entirely lazy through
  `@codemirror/language-data` (no eager core set; the startup bundle budget
  matters more than the first-highlight delay). Unlabeled fences run a small
  in-house heuristic (`detect/`) and are highlighted by parsing their text
  with the guessed language once it has loaded.

## Consequences

- A new multi-line element (future: math blocks, admonitions) is a
  `blockFamily`; a new inline element stays a `livePreviewFamily`.
- `editor/theme` exposes the `editorDark` facet so widgets that draw their
  own graphics re-render on theme change.
- Mermaid adds a large optional chunk to `dist/`; `npm run build` warns
  about its size and that is expected. The entry chunk budget (1 MB gzip)
  is unchanged.
- Image files allowed in the asset scope stay allowed for the process
  lifetime; one window edits one file, so the set stays small.
