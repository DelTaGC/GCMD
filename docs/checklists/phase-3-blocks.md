# Phase 3: blocks

Run with `npm run app:dev -- -- <absolute path to tests/fixtures/sample.md>`
and again after switching the theme (View > Theme). The phase 2 checklist
must still pass.

## Tables

- [ ] With the cursor elsewhere, both tables in "Tables" render as grid widgets: header row bold on a tinted background, cell borders, left/center/right alignment from the delimiter row, `**bold**`, `` `code` `` and the link rendered inside cells, the escaped pipe shown as `|`.
- [ ] Clicking a cell shows the raw table in monospace with muted pipes and puts the cursor in that cell's source (no scroll jump).
- [ ] Arrow down from the line above a table lands on the table's first character and reveals the source; arrow up from below lands at its end. Shift+Arrow still extends the selection.
- [ ] Inside a table, Tab selects the next cell's content (header -> first body cell, skipping the delimiter row); Shift+Tab goes back and does nothing at the first cell; Tab in the last cell appends an empty row and places the cursor in its first cell.
- [ ] Typing in a cell to make it wider, then clicking outside the table, realigns all pipes in one step; Ctrl+Z undoes only the alignment, a second Ctrl+Z the typing. The title dirty marker reflects both.
- [ ] Clicking into a table and leaving without typing does not change the document (no dirty marker).
- [ ] Shift+Alt+F inside a misaligned table aligns it; the cursor stays on the same character.
- [ ] The table nested in a list or a quote (add one to try) renders and realigns with its indentation / `> ` prefix kept.
- [ ] Ctrl+click on the link inside the rendered table opens it in the browser without entering the table.
- [ ] Enter inside a cell selects the same column of the next row (header -> first body row) and never splits the row; Enter in the last row appends an empty row with the cursor in the same column. Shift+Enter still inserts a line break.
- [ ] With the cursor in a table, a table bar appears just below the cursor's row and follows the cursor from row to row (in a long table it stays in view; it stays while a cell is selected after Tab, the quickbar then showing above the selection without overlapping): row buttons (insert above/below, delete), column buttons (insert left/right, delete, move left/right), the alignment dropdown and Align. Escape hides it until the cursor leaves the table and comes back.
- [ ] Insert row below (bar or Ctrl+Enter) adds an aligned empty row with the cursor in the same column; above the header it makes a new empty header and the old header becomes the first body row. Outside a table Ctrl+Enter still inserts a blank line below.
- [ ] Insert column left/right adds an empty column in every row including the delimiter; delete column removes it (the last column cannot be deleted); Shift+Alt+Left/Right move the column with its alignment, the cursor following it.
- [ ] Delete row on a body row removes it; on the header it promotes the first body row; on a header-only table it removes the table. Each structural command is one Ctrl+Z step and leaves the table aligned.
- [ ] The alignment dropdown shows the current column's alignment and changing it rewrites the delimiter cell (`:--`, `:-:`, `--:`); the rendered widget follows once the cursor leaves.
- [ ] Edit > Table lists the same commands with Ctrl+Enter, Ctrl+Shift+Enter, Shift+Alt+Left/Right and Shift+Alt+F.
- [ ] Hovering a rendered table shows (+) handles on every column boundary (top edge) and row boundary (left edge); hovering a handle draws an accent guide line on that boundary. Clicking one opens the table in raw mode with the cursor in a new empty column or row at that boundary (the top handle makes a new header, the old one becoming the first body row). The widget's height does not change on hover.
- [ ] In raw mode the single pipes draw as thin column rules joining from row to row (the delimiter row stays muted text); the cell under the cursor has a tinted background and, from a body cell, its header cell is underlined in the accent colour. Both move with the cursor and with Tab; on the delimiter row nothing is highlighted. Check both themes.

## Mermaid

- [ ] The first mermaid fence shows "Rendering diagram…" briefly, then the flowchart; the sequence diagram renders too. No layout jump once rendered (scroll position unchanged).
- [ ] The third diagram (`layout: elk`) renders with the ELK layout: the `Session` subgraph left to right, no error box (elkjs, ADR 0012).
- [ ] Switching theme re-renders diagrams with matching dark/light colors.
- [ ] Clicking a diagram puts the cursor on the first source line and shows the fence with ```mermaid highlighted; clicking elsewhere renders the diagram again instantly (cached).
- [ ] Breaking the source (type `xx` on the `graph TD` line, click away) shows the inline error box with mermaid's message; fixing it renders again.
- [ ] Network/dev tools: the mermaid chunk is loaded only when the first diagram is rendered; a document without mermaid never loads it.

## Code fences

- [ ] Inactive fences show a language dropdown instead of the opening fence (`ts`, `python`, `rust`, `json`); the unlabeled bash fence shows `Shell (auto)` and is highlighted as shell.
- [ ] Choosing another language in the dropdown rewrites the info string (the first word only, `{"meta": true}` stays); choosing "plain text" removes it; Ctrl+Z undoes it. The cursor does not move into the block.
- [ ] Choosing a language not previously used (e.g. Haskell) highlights after a short delay (lazy load) without reload.
- [ ] Shift+Alt+L inside the unlabeled fence writes the detected language (`shell`) into the fence.
- [ ] The active block still shows both fences and the raw info string in the markup color.

## Images and links

- [ ] "Inline image" shows the GCMD icon when the line is inactive and `![GCMD icon](../../icon/gcmd-icon.png)` with markup colors when active.
- [ ] The missing image shows its alt text in a dashed box; the remote image stays as muted text (no network request).
- [ ] After Save As into another folder, relative images resolve against the new location.
- [ ] Ctrl+click on `the plan` opens PLAN.md in a second GCMD window; Ctrl+click on `the GFM spec`, on a bare `https://` autolink and on `www.example.com` opens the browser; on the e-mail autolink opens the mail client. Holding Ctrl shows a pointer cursor over links.
- [ ] A plain click on a link still just places the cursor.

## Cursor stability

- [ ] Entering and leaving tables, diagrams, images and fences with the mouse or the arrow keys never scrolls the view unexpectedly and never lands the cursor inside hidden markup.
- [ ] Everything above looks right in both themes (table borders and header tint, mermaid colors, error box, dropdown chevron).
