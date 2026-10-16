# Frontend conventions (src/)

Vanilla TypeScript, no UI framework, Vite bundling, CodeMirror 6 editor.
Root `CLAUDE.md` invariants apply; this file says how to honor them here.

## Structure

- `main.ts` only orchestrates: read launch args via `ipc/`, build the editor
  via `editor/create.ts`, mount chrome. No editing logic here.
- `editor/create.ts` assembles `EditorState` from a list of extensions. Every
  feature is its own extension module; `create.ts` must stay a flat list.
- `editor/livePreview/<element>.ts`: one file per element family (inline,
  headings, lists, codeFence, table, mermaid, image...). Each exports a single
  `Extension`. Shared "is this node active?" logic lives only in
  `editor/livePreview/activeBlock.ts`.
- `editor/commands/`: named commands, `(view: EditorView) => boolean`, exported
  through a registry `{ id, title, run }`. Add the command, then bind it in
  `keymap.ts`, then expose it in menu/quickbar. Never inline a transaction in
  chrome code.
- `app/session.ts` owns the open document (path, save metadata, dirty flag,
  last known mtime) and the open/save/new/close flows; it registers the
  `file.*`, `view.*` and `help.*` commands and handles `file-changed`
  events (silent reload through `app/reload.ts` when clean, banner when
  dirty). Menu events arrive as command ids (`ipc/events.ts`) and `main.ts`
  just runs them. `view.setState` fires no update, so the session calls
  `onLoad` after loading a document for things that mirror the state.
- `app/outline.ts` links the editor to the sidebar: headings come from
  `editor/outline.ts` (pure, tree-based), recomputed debounced after the
  document or tree changed; selection changes only move the highlight.
  Clicking a heading goes through `commands/cursor.ts` `jumpTo`.
- `app/updates.ts` is the self-update flow (ADR 0010): startup check,
  `help.checkUpdates` / `help.autoUpdate` commands, the update banner, and
  install after the session's unsaved-changes prompt. The rules (when to
  check, skipped versions, texts) are pure functions in
  `app/updatePolicy.ts`.
- `editor/commands/listItems.ts` moves list items between nesting levels
  (Tab, Shift-Tab, Backspace right after a nested item's marker) using the
  Lezer tree, and `withRenumber(command)` wraps a list command (including
  the markdown Enter and Backspace) so the ordered lists it touched are
  renumbered in the same transaction. A list's first item keeps its number
  unless it was not a list head before the edit (then 1); lazy `1. 1. 1.`
  lists stay lazy. Items inside blockquotes fall back to plain indent.
- Line wrap: `app/wrap.ts` owns the wrap settings (`off`, `full`, `fixed`),
  computes the text column with the pure rules in `app/wrapLayout.ts`,
  applies it through `editor/wrap.ts` (a `lineWrapping` compartment plus
  the `--wrap-margin` CSS variable used as the content padding) and draws
  `chrome/wrapBar.ts`, the strip under the editor that is dragged and
  double-clicked. It registers `view.wrap.*` for View > Line Wrap.
  `replaceDocument` carries the wrap flag into the new state.
- `editor/quickbar.ts` is the selection toolbar: a `showTooltip` state field
  (visible when the main selection is non-empty, no drag in progress, not
  dismissed) whose buttons run registry commands. `edit.escape` dismisses
  it before closing search or collapsing the selection.
- `editor/linkCompletion.ts` completes link destinations (ADR 0013): the
  only `autocompletion` source (HTML tag completion is overridden). It
  finds the destination from the line text, lists one folder at a time
  through the `dirLister` facet (IPC `list_dir` by default; tests and the
  browser dev page supply their own) and offers `#` anchors from
  `editor/outline.ts`. Its keys are chained into the existing Enter, Tab,
  arrow, Page and Escape commands, so the keymap keeps one command per key.
- `ipc/`: the only module allowed to import `@tauri-apps/api` or plugins.
  Each Rust command gets a typed wrapper function with the same name.
- `chrome/`: plain DOM builders returning an element plus an `update()`;
  no global state, no querySelector outside the module that created the node.
  Chrome never dispatches to the editor: the sidebar emits `onJump`, the
  banner runs the `BannerAction`s it was given.
- `detect/`: pure functions, no DOM.
- Themes: CSS custom properties on `:root` and `:root[data-theme="dark"]`.
  Editor theme in `editor/theme/` references those variables only.

## Live-preview rules

- Use `Decoration.replace` with a widget for block-level rendering (tables,
  mermaid, images), `Decoration.mark` for inline styling, and
  `Decoration.replace({})` to hide markup characters. Widgets must implement
  `eq()` so unchanged content is not re-rendered.
- Inline work (marks, hidden markup, single-line widgets) is computed from
  the Lezer syntax tree in a `ViewPlugin` limited to `view.visibleRanges`:
  a family is a pure `NodeVisitor` that records into a `Collector`, and
  `livePreviewFamily(visitor)` in `livePreview/decorate.ts` wraps it. Its
  replaced ranges are atomic (`EditorView.atomicRanges`) so the cursor never
  lands inside hidden markup. Plugin decorations must not span line breaks;
  a fence line is replaced from `line.from` to `line.to` only.
- Multi-line widgets (tables, mermaid) are `blockFamily(visitor)`: a state
  field over the whole document. The visitor records every block once per
  document or tree change and must return `false` for every non-container
  node so the walk stays cheap; selection changes only re-apply the
  active-block rule to the cached list. Block ranges reach the cursor
  commands through the `blockRanges` facet. Never walk the whole tree on
  every selection change, and keep the sidebar outline debounced.
- A lazily loaded resource (language parser, renderer) that arrives after a
  computation dispatches `refreshLivePreview.of(null)` so families recompute.
- Clicking a rendered widget moves the cursor into the block, which makes the
  block active and reveals its source. That is the only "edit mode" switch.
  Widgets that handle their own clicks return `true` from `ignoreEvent` for
  everything but `mousedown` and dispatch the selection themselves.
- Widgets build DOM with `document.createElement`, never `innerHTML`, except
  for mermaid's sanitized SVG. Things that resolve asynchronously (images,
  diagrams, languages) check `isConnected` before touching their element and
  call `view.requestMeasure()` when their height changed.
- The document path is editor state (`editor/document.ts`, `documentPath`
  facet); families read it from the state, never from the session.
- A decoration bug that changes text is a release blocker.

## Adding a live-preview element

1. Create `editor/livePreview/<name>.ts` exporting an `Extension`.
2. Register it in `editor/create.ts`.
3. Add the construct to `tests/fixtures/sample.md` if missing.
4. Unit-test the range computation with a plain `EditorState` (no DOM):
   `editor/testing.ts` has `stateWith(doc, cursor)` and `kinds(output)`;
   see `livePreview/families.test.ts`.
5. Add a checklist line in `docs/checklists/` for the visual behavior.

## Performance

- Dynamic `import()` for mermaid and non-core languages; import at first use,
  cache the module promise.
- Avoid per-keystroke allocations in view plugins; reuse `RangeSetBuilder`.
- Check `npm run build` output: the entry chunk must stay under 1 MB gzip.

## Testing

- Vitest, `environment: "node"` by default. Tests that need a DOM set
  `// @vitest-environment jsdom` at the top (add jsdom when first needed).
- Test files sit next to the code as `<name>.test.ts`.
- The GFM harness in `spec/` gates on `KNOWN_FAILURES`: an example outside
  the list must pass, a listed one must still fail. A new failure needs a
  fix or a list entry plus a row in `docs/known-deviations.md`; a fixed one
  is removed from both.
- Timings live in `tests/perf/*.perf.ts` (`npm run bench`, not part of
  `npm test`); they print a table and assert loose limits. Record new
  baselines in `docs/perf.md`.
- Platform checks: `isMac()` in `ipc/env.ts` is the only platform test;
  keys use `Mod`, labels come from `formatKey`. Anything Alt+letter is
  Windows/Linux only.
