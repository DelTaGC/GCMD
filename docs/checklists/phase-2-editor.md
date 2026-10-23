# Phase 2: usable editor

Run with `npm run app:dev -- -- <absolute path to tests/fixtures/sample.md>`
and again after switching the theme (View > Theme).

## Open, save, title

- [ ] Launching with a file argument opens it; the title is `sample.md - GCMD`.
- [ ] Launching without an argument shows an empty `Untitled - GCMD` document.
- [ ] Typing adds `*` to the title; undoing back to the saved text removes it.
- [ ] Ctrl+S on an untitled document opens Save As; on a named one saves silently.
- [ ] After editing one line and saving, `git diff tests/fixtures/sample.md` shows only that line (no EOL, BOM or whitespace churn). Repeat with a CRLF file and a file without trailing newline.
- [ ] File > Open replaces the document; with unsaved changes a Save / Don't Save / Cancel prompt appears first and Cancel keeps everything.
- [ ] File > Open Recent lists the last files, most recent first; Clear Recent empties it.
- [ ] File > New clears to Untitled (after the prompt when dirty); File > New Window starts a second independent window.
- [ ] Dropping a `.md` file on the window opens it.
- [ ] Closing the window (X, Alt+F4, File > Exit) with unsaved changes prompts; Cancel keeps the window open.
- [ ] Opening a non-UTF-8 file shows an error banner and keeps the current document.
- [ ] Setting GCMD as the default `.md` app on Windows and double-clicking a file opens it in a new window.
- [ ] Window size and position are restored on the next launch.

## Live preview (cursor outside the block)

- [ ] On an active line every markup character (`#`, `*`, `` ` ``, `~~`, `[`, `](url)`, `>`, `-`, `[ ]`, fences, `\`) shows in the markup color (dark red in light, salmon in dark), never in the text color.

- [ ] Headings render larger without the `#`; moving the cursor onto the line reveals `# `.
- [ ] Setext headings render as headings with a muted underline.
- [ ] Bold, italic, bold-italic, strikethrough and inline code hide their markers off-line and show them on-line.
- [ ] Links show only the text (underlined); hovering shows the URL; the active line shows the full `[text](url)`.
- [ ] Bare URLs, `www.` links and emails are styled as links.
- [ ] Bullets render as `•`; ordered markers stay as typed; the active line shows the raw marker.
- [ ] Task items show a checkbox; clicking it toggles `[ ]`/`[x]` in the text without moving the cursor; done tasks are struck through.
- [ ] Blockquotes have a left border and hide their `>` markers; the active line shows them.
- [ ] `---`, `***`, `___` render as rules; the active line shows the characters.
- [ ] Fenced code shows a language label instead of the opening fence, highlighted code (ts, python, rust, json, bash), and no closing fence (the background ends with the last code line, no empty line below it); the active block shows both fences.
- [ ] Indented code blocks use the monospace background.
- [ ] Tables and mermaid blocks render as widgets (see phase-3-blocks.md); the active block shows raw text in monospace.
- [ ] Escapes like `\*` hide the backslash off-line.
- [ ] Arrow keys never land inside hidden markup; the cursor moves from the text to the next line.
- [ ] Clicking a rendered element puts the cursor there and reveals the source without a jump.

## Editing

- [ ] Ctrl+B / Ctrl+I / Ctrl+E / Ctrl+Shift+X toggle bold / italic / inline code / strikethrough on a selection, on the word at the cursor, and back off.
- [ ] Ctrl+E on a selection spanning several lines wraps those whole lines in a fenced code block (cursor after the opening fence, ready for a language); Ctrl+E on a multi-line selection inside a fence removes both fences.
- [ ] Ctrl+K wraps the selection as a link; with a URL selected it becomes the destination.
- [ ] Ctrl+1..6 set the heading level; Ctrl+0 removes it.
- [ ] Ctrl+D duplicates the line; Alt+Up/Down move it; Shift+Alt+Up/Down copy it; Ctrl+Shift+K deletes it.
- [ ] Enter continues lists, task lists and quotes; Backspace on an empty item removes the marker.
- [ ] Tab / Shift+Tab indent and outdent list items (nesting and numbering details: lists-and-wrap.md).
- [ ] Ctrl+F opens find; Ctrl+H opens find with replace; F3 / Shift+F3 step through matches; Escape closes the panel.
- [ ] Ctrl+Z / Ctrl+Y undo and redo; Edit > Undo / Redo do the same.
- [ ] Alt+F / Alt+E / Alt+V / Alt+H open the matching menu while the editor has focus; arrows, letters and Escape then work inside it.
- [ ] The backtick, `^`, `¨` and `´` dead keys type their characters normally.

## Theme

- [ ] View > Theme > Light / Dark / System switch immediately, persist across restarts, and System follows the OS setting live.
- [ ] Every item above looks right in both themes (contrast of code background, quotes, links, selection, search panel).
