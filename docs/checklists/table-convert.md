# Insert and convert tables

Run in `npm run app:dev` with `tests/fixtures/sample.md`, in both themes.
The conversion rules (list depth, rows per leaf, tab-separated lines,
table back to list, blank lines around the table) are unit-tested in
`src/editor/commands/tableConvert.test.ts`.

- [ ] Edit > Table > Insert Table on a blank line puts an empty two-column table (header and one row) there; the cursor is in the first header cell and typing fills it.
- [ ] Insert Table with the cursor in a paragraph or list puts the table after that paragraph or the whole list, with a blank line before and after; the paragraph is not split.
- [ ] From the keyboard: Alt+E, open the Table submenu, then I runs Insert Table, V Convert Selection to Table, S Convert Table to List.
- [ ] Selecting a nested list and clicking Table in the quickbar gives one row per leaf item and one column per level: `- Fruits / - Apple / - Banana` gives `Fruits | Apple` and `| Banana`.
- [ ] Selecting plain lines and clicking Table gives one single-cell row per line; pipes in the text are escaped (`\|`) and render as `|`.
- [ ] Lines pasted from a spreadsheet (tab-separated) become columns, the first line being the header.
- [ ] Edit > Table > Convert Selection to Table with no selection converts the list or paragraph the cursor is in.
- [ ] Inside a table, the quickbar Table button and Convert Selection to Table do nothing.
- [ ] Edit > Table > Convert Table to List with the cursor in a table gives a nested bullet list; an empty header row is dropped; converting the list back gives the same table.
- [ ] Every conversion and insertion is one undo step (Ctrl+Z restores the original text exactly).
- [ ] The right-click menu is unchanged (WebView2's own menu, see ADR 0014): spelling suggestions still show for a misspelled word.
