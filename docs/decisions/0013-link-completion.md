# 0013: Link destination completion with `@codemirror/autocomplete`

Date: 2026-10-16. Status: Accepted.

## Context

Typing a relative path to a local file in a link (`[text](../docs/x.md)`)
means remembering folder and file names exactly. Three ways were weighed:
a popup that lists one folder at a time as the path is typed, a file
picker command or drag and drop that inserts a link, and a fuzzy search
over the whole folder tree. The first covers the typing case at a small
cost; the picker can be added later; the tree search needs a recursive
walk with limits and cancellation, which a document in a large folder
(home, Downloads) makes slow.

## Decision

- **`@codemirror/autocomplete`** (MIT, already a dependency of
  `@codemirror/lang-markdown`) draws the popup. `editor/linkCompletion.ts`
  installs it with `override: [our source]` (no HTML tag completion),
  `defaultKeymap: false` and no icons.
- **One folder at a time.** The source reads the line before the cursor
  (a link being typed has no `)` yet, so the syntax tree does not see
  it), takes the directory part of the destination and asks the Rust
  command `list_dir` for its entries. Picking a folder inserts `name/` and
  lists it at once. Image links (`![`) offer folders and images only;
  hidden entries and `../` show once the typed name starts with `.`.
  `validFor` keeps the result while the last segment is typed, so there is
  one IPC call per folder, not per key.
- **Headings.** A destination starting with `#` lists this document's
  headings as GitHub anchors (lower case, punctuation removed, spaces to
  `-`, repeats numbered `-1`, `-2`). Anchors in other files are not
  offered: that would mean reading them.
- **Encoding.** Inserted names are percent-encoded where the destination
  syntax needs it (spaces, parentheses, `<`, `>`, `%`, `#`, `?`); inside
  `<…>` spaces stay. `resolve_href` decodes the same escapes, so
  completed links open and render.
- **`list_dir`** (Rust, `paths.rs`) resolves the directory like
  `resolve_href` (relative to the document, absolute as-is, no schemes),
  returns names and a folder flag only, not recursive, capped at 2 000
  entries, on a blocking thread. An unsaved document has no folder, so
  relative listings fail and the popup stays closed. It is an app command
  like `resolve_path`; no plugin permission is involved (invariant 8).
- **Keys stay in the one table.** Enter, Tab, Up, Down, Page Up and Page
  Down chain the completion command in front of what the key already
  does (`acceptCompletion`, `moveCompletionSelection`); Escape closes the
  popup first; Ctrl+Space (`completion.start`) opens it. Clicking an
  option is CodeMirror's own popup handling, like the search panel's.

## Consequences

- The startup bundle grows by about 25 kB raw, 9 kB gzip (entry chunk
  371 kB, 131 kB gzip), well under the 1 MB budget; the package is small
  enough that a lazy import is not worth the indirection.
- The source runs on every typed character but only scans the current
  line up to the cursor; the listing is asynchronous, so typing latency is
  unaffected.
- The browser dev page has no IPC: the folder listing is empty there
  unless a `dirLister` is supplied (tests and manual checks do).
