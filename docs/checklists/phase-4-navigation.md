# Phase 4: navigation and editing UX

Run with `npm run app:dev -- -- <absolute path to tests/fixtures/sample.md>`
and again after switching the theme (View > Theme). The phase 2 and 3
checklists must still pass.

## Sidebar outline

- [ ] View > Sidebar (Ctrl+Shift+L) shows the outline on the right; the menu check mark and the setting follow it across restarts.
- [ ] The tree mirrors the headings of the sample document: `GCMD feature sample` at the top, the `##` sections under it, `Level 3`…`Level 6` nested under `Headings`. Inline markup (`*`, `` ` ``, link URLs) does not appear in the labels.
- [ ] The chevron collapses and expands a node; collapsed state survives typing elsewhere in the document.
- [ ] Clicking a heading scrolls it to the top of the editor, puts the cursor on it (the `#` marks appear) and keeps the focus in the editor.
- [ ] Moving the cursor (arrows, Ctrl+End, clicking) highlights the section that contains it; the highlighted row scrolls into view inside the sidebar.
- [ ] Adding, renaming or deleting a heading updates the tree within a moment of typing; a document without headings shows "No headings yet."
- [ ] With the sidebar hidden, typing is as fast as before; showing it again displays the current tree.

## Quickbar

- [ ] Selecting text with the mouse shows the bar above the selection start once the button is released, not while dragging; Shift+Arrow selections show it too.
- [ ] B, I, `<>`, S, Link and Clear run the matching command on the selection and the selection stays; hovering shows the shortcut in the tooltip.
- [ ] The heading dropdown shows the level of the selection's first line; choosing another level rewrites the line and returns focus to the editor.
- [ ] Clear turns `**bold** *em* [t](u)` into `bold em t`.
- [ ] Escape hides the bar and keeps the selection; a second Escape collapses the selection. The bar comes back when the selection changes.
- [ ] Escape still closes the search panel (from the panel's input and from the editor).
- [ ] Collapsing the selection (click, arrow key, typing) hides the bar; it never covers the selected text.

## External changes

- [ ] With a clean buffer, editing `sample.md` in another program reloads it silently: the new text appears, the cursor and the scroll position stay, the title shows no dirty marker, Ctrl+Z brings the previous text back (and makes the document dirty).
- [ ] With a dirty buffer, the same edit shows the warning banner "changed on disk. Reload and lose your edits, or keep them?": Reload applies the disk version and clears the dirty marker; Keep hides the banner and Ctrl+S then overwrites the disk version.
- [ ] Saving from GCMD never shows the banner nor reloads (own writes are recognized by their modification time).
- [ ] Deleting or renaming the file on disk shows "was deleted or moved on disk. Save to write it again."; Ctrl+S recreates it and the watch resumes.
- [ ] After Save As to another path, changes to the new file are watched and the old file is ignored. File > New stops watching.
- [ ] A change that produces identical text (touch, save without edits) causes no visible effect.

## Keymap v2 and menus

- [ ] Edit > Format, Heading and Line submenus list the commands with their shortcuts; each entry runs the command (Bold, Heading 2, Duplicate, Move Up…).
- [ ] Edit > Find Next (F3) and Find Previous (Shift+F3) step through matches.
- [ ] Ctrl+L cycles a line: plain text -> `- [ ] `, list item -> task, open -> done -> open; blockquoted lines keep their `>`.
- [ ] Edit > Toggle Task and Detect Code Language show Ctrl+L and Shift+Alt+L; Edit > Table > Align Table shows Shift+Alt+F.
- [ ] Ctrl+Z / Ctrl+Y / Ctrl+A still work inside the search panel's input fields.

## Theme

- [ ] Sidebar background, hover and active rows, quickbar, banner buttons look right in both themes.
