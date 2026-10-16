# Link completion

Run in `npm run app:dev` with a saved document in a folder that has
subfolders, images and other `.md` files (a scratch copy of
`tests/fixtures/sample.md` next to a few files works), in both themes.
Detection, encoding and anchors are unit-tested in
`src/editor/linkCompletion.test.ts`, the listing in `src-tauri/src/paths.rs`.

- [ ] Typing `[x](` opens a popup with the document's folder: folders first (ending in `/`), then files, `.md` files ahead of others; hidden entries are not listed.
- [ ] Typing filters the list; Up/Down and Page Up/Down move the selection; Enter or Tab inserts it.
- [ ] Picking a folder inserts `name/` and immediately lists that folder; `../` (offered after typing `.`) lists the parent.
- [ ] A name with spaces or parentheses is inserted percent-encoded (`my%20file.md`); in `[x](<` it is inserted as-is. Ctrl+click on the completed `.md` link opens it.
- [ ] `![alt](` lists folders and images only; the completed image renders when the cursor leaves the line.
- [ ] `[label]: ` at the start of a line completes the same way.
- [ ] `[x](#` lists this document's headings as anchors (`#next-step`) with the heading text beside them, in document order.
- [ ] Escape closes the popup without changing the text; a second Escape behaves as before (quickbar, search, selection). Ctrl+Space reopens it.
- [ ] With no popup, Enter still continues lists, Tab still nests list items and moves between table cells, arrows still step into tables and diagrams.
- [ ] Nothing pops up inside inline code, code blocks, or while typing `https://…`; an unsaved (untitled) document shows no folder listing, but `#` headings still work.
- [ ] Dark theme: the popup uses the panel colors, the selected row and matched letters are readable.
