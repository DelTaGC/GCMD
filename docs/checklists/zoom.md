# Zoom (text size)

Run in `npm run app:dev` with `tests/fixtures/sample.md`, in both themes.
Size steps and wheel handling are unit-tested in `src/app/zoomLevels.test.ts`,
the scaled fixed wrap width in `src/app/wrapLayout.test.ts`.

- [ ] Ctrl+mouse wheel up over the text makes it larger one step per notch, down makes it smaller; the page does not scroll meanwhile.
- [ ] Ctrl+wheel over the outline sidebar or the wrap bar zooms the text too.
- [ ] A touchpad pinch (or two-finger Ctrl+scroll) zooms smoothly, not in jumps of several steps.
- [ ] Ctrl++ zooms in (Ctrl+Shift+1 on Swiss-French, and the numpad +), Ctrl+- zooms out (main keyboard and numpad); Ctrl+0 still makes a paragraph.
- [ ] View > Zoom > Zoom In / Zoom Out / Reset Zoom work; Reset returns to 100%.
- [ ] After each change a "Text size N%" badge shows in the editor's top right corner for about a second, readable in both themes.
- [ ] Zooming in the middle of a long document keeps the line at the top of the window in place; at the very top the top padding stays.
- [ ] Headings, inline code, fenced code, tables, task boxes and mermaid diagrams grow with the text; images keep their size.
- [ ] Fixed-width wrap: the column grows with the zoom (about the same words per line) until it fills the window; full-width wrap keeps its margins.
- [ ] The size survives a restart (`fontSize` in settings.json); a new window opens at the same size.
- [ ] The document is not marked dirty by zooming.
