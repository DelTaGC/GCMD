# Phase 7: settings panel and spell-check

Run in `npm run app:dev` with `tests/fixtures/sample.md`, in both themes.

## Panel

- [ ] File > Settings... and Ctrl+, open the panel over the editor (macOS: GCMD > Settings..., Cmd+,); Escape, the × button and a click outside close it and the cursor is back in the editor.
- [ ] While the panel is open, Ctrl+B and other editing shortcuts do nothing to the document; Ctrl+S still saves.

## Text and colors

- [ ] Typing a text font (e.g. `Georgia`) and leaving the field changes the document font at once; clearing it returns to the system font. Same for the code font on inline code and code blocks.
- [ ] Text size, code size and line height change the editor live; the cursor and selection stay aligned with the text afterwards (click a few words).
- [ ] A changed light color shows only in the light theme and a changed dark color only in the dark theme; its ↺ button and "Reset all colors" bring the defaults back.

## Spelling

- [ ] With "Check spelling while typing" on, a misspelled word typed in prose (or on a line just edited) gets the native underline; right-click shows suggestions. WebView2 offers no "Add to dictionary" item; existing words elsewhere are only checked once their line is edited.
- [ ] Misspelled words inside inline code, a code block, a URL or an autolink are never underlined.
- [ ] Turning the option off removes the underlines; it stays off after a restart.
- [ ] Right-click (Windows) shows the WebView2 menu described in ADR 0014: suggestions, Cut/Copy/Paste, Emoji (smileys and special characters insert text); a release build has no Inspect item.

## Keyboard shortcuts

- [ ] The list shows every command with its keys; the filter matches titles and keys (`ctrl+b`).
- [ ] "+" then Ctrl+Shift+B on "Bold" adds the key; Ctrl+Shift+B makes text bold, and Format > Bold shows it in the menu.
- [ ] Assigning Ctrl+I to "Bold" says it was removed from "Italic"; Ctrl+I now bolds, and Italic has no key in the menu.
- [ ] Recording refuses Ctrl+Alt+E (AltGr), a bare letter and the `^` dead key with a message; Escape cancels recording.
- [ ] Recording Ctrl+S (a menu accelerator) records it instead of saving.
- [ ] × on a key removes it; ↺ and "Reset all shortcuts" restore the defaults, menus included.

## Persistence and windows

- [ ] All changes survive a restart; `settings.json` holds only the changed colors and shortcuts.
- [ ] With two windows open, changing the theme in one and a font in the other, then restarting, keeps both changes.
