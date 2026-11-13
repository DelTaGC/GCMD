# Print and PDF export

Run in `npm run app:dev` with `tests/fixtures/sample.md`, in both themes.
Print mode and the lists of languages and images to preload are unit-tested
in `src/editor/livePreview/activeBlock.test.ts` and `families.test.ts`, the
link targets in `src/editor/printLinks.test.ts`.
The PDF comes from the print dialog: "Save as PDF" or "Microsoft Print to
PDF" on Windows, "Save as PDF" on macOS, "Print to File" on Linux.

- [ ] File > Print... and Ctrl+P open the system print dialog; Alt+F, P works too.
- [ ] The preview shows only the document: no sidebar, wrap bar, banner, search panel, quickbar, table bar, cursor or selection.
- [ ] The whole document is there, down to the last paragraph, also when the window showed only the top of it (compare the last page with the end of the file).
- [ ] The block under the cursor prints rendered: put the cursor in a table, a mermaid fence, a heading and a bold word in turn; no markup characters appear.
- [ ] Diagrams, images and code highlighting further down the document, never scrolled to, are printed (no "Rendering diagram…" placeholder, no unhighlighted code).
- [ ] From the dark theme the printout is light (text, code backgrounds, diagrams); after the dialog closes the window is dark again.
- [ ] Code blocks and table headers keep their background; the fence language prints as a plain label without the dropdown arrow.
- [ ] Saved with "Save as PDF", links are clickable in the PDF: a web link, a bare `www.` link, an e-mail address, a reference link (`[text][label]`) and a link inside a table cell open their target.
- [ ] `[text](#heading)` jumps to that heading inside the PDF.
- [ ] A link to a local file (`[the plan](../../PLAN.md)`) opens that file from the PDF; in an untitled document it prints as plain link text.
- [ ] "Microsoft Print to PDF" still produces the PDF, without clickable links (the printer driver drops them).
- [ ] While the dialog is open and after it closes, clicking a link in the editor never navigates the window away; Ctrl+click still opens links afterwards.
- [ ] Long lines wrap at the page margin, also with View > Line Wrap > Off; nothing is cut off on the right.
- [ ] A heading is not left alone at the bottom of a page; table rows, diagrams and images are not split across pages.
- [ ] The text prints at the zoomed size (View > Zoom), on the page width whatever the wrap width is.
- [ ] After the dialog closes (printed or cancelled) the editor is as before: cursor position, scroll position, active block showing its markup, focus in the editor.
- [ ] The document is not marked dirty by printing and `git diff` shows no change to the file.
- [ ] Ctrl+P twice in a row opens one dialog, not two.
- [ ] A 1 MB document (`npm run fixtures:large`) prints completely; preparing it may take a few seconds.
- [ ] macOS: Cmd+P opens the native print sheet with the whole document, also when the sheet stays open for a while before "Save as PDF" (the last page is still there).
- [ ] macOS: closing the sheet restores the editor at once (theme, active block), without a key press or click; a key typed right after is not typed into a document still in print mode.
- [ ] A reference link inside a table cell (`[text][label]`) is clickable in the PDF; `[text]()` is not a link.
- [ ] Linux: the GTK print dialog opens and "Print to File" writes a complete PDF.
