# List nesting and line wrap

Run in `npm run app:dev` with `tests/fixtures/sample.md` (or a scratch copy),
in both themes. Numbering logic is unit-tested in
`src/editor/commands/listItems.test.ts`, the wrap layout in
`src/app/wrapLayout.test.ts`.

## List nesting and numbering

- [ ] In `1. first` / `2. second` / `3. third`, Enter at the end of `second` then Tab gives a `1.` nested under `second`; `third` stays `3.`.
- [ ] Typing a word, Enter, gives a nested `2.`; Shift+Tab on it gives `3.` after `second`, and `third` becomes `4.`.
- [ ] Enter, Tab, then Backspace on the empty nested item moves it back out with the next number; the items below renumber.
- [ ] Backspace with the cursor right after a nested item's marker (text after it) moves the item out; Backspace on a top-level item still removes the marker.
- [ ] Tab on an item that already has nested children nests it after them, aligned with them and numbered after the last one.
- [ ] Tab on the first item of a list does nothing; Tab on a paragraph line still indents it.
- [ ] Shift+Tab on a nested item with siblings below it makes them its children, numbered from 1.
- [ ] Selecting several sibling items and pressing Tab nests them all under the item above, numbered 1, 2, ...
- [ ] A list of `1.` / `1.` / `1.` keeps repeating `1.` after Enter.
- [ ] Going from `9.` to `10.` (Enter in a 9-item list) keeps the children of the renumbered item nested.
- [ ] Ctrl+Z undoes a Tab or Shift+Tab, including the renumbering, in one step.

## Line wrap

- [ ] A thin bar under the editor: light margins, darker text column lined up with the text; the tooltip names the mode.
- [ ] Full width (default): the text fills the window minus the margins; dragging either edge of the dark part changes both margins alike; resizing the window keeps the margins.
- [ ] Double-click the bar: full width -> off (bar all light, long lines scroll sideways) -> fixed width (centered column) -> full width.
- [ ] Fixed width: dragging changes the column width, still centered; resizing the window keeps the width until the window is narrower.
- [ ] View > Line Wrap shows the current mode checked; choosing a mode there updates the editor and the bar.
- [ ] The mode and sizes survive a restart (`wrap` in settings.json).
- [ ] Dark theme: the bar is dark gray with a lighter text column, readable against the editor.
