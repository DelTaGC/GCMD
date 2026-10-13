# Phase 5: quality, performance and other platforms

The phase 2, 3 and 4 checklists must still pass on Windows. The numbers
behind the budgets are in `docs/perf.md`; this list covers what only a
person at the machine can judge.

## Performance (Windows, release build)

- [ ] Double-clicking a small `.md` file shows the editable document in under a second, with no visible flash of raw markup before the preview.
- [ ] `tests/fixtures/generated/large.md` (1 MB) opens and is scrollable within half a second; the outline fills in a moment later without freezing the editor.
- [ ] At the end of `tests/fixtures/generated/20k-lines.md`, holding a key down inserts characters without visible lag; moving the cursor through tables and fences stays smooth.
- [ ] After ten minutes of editing (typing, undo, moving blocks), Task Manager shows the process group's memory stable, not climbing (see `docs/perf.md` for the reference values).

## Linux (`npm run linux:build`, install the `.deb` or run the AppImage)

- [ ] The app starts, opens a file from the command line and from the file manager (`.md` association), and shows the native GTK menu bar.
- [ ] File > Exit (Ctrl+Q) asks about unsaved changes; Alt+F opens the File menu once (not twice).
- [ ] Ctrl+S saves without changing line endings (`git diff` shows only the edited lines); the file watcher reloads an external change.
- [ ] Images relative to the file render; Ctrl+click on a link opens the browser.
- [ ] Light and dark themes follow View > Theme; "System" follows the desktop setting.

## macOS (CI artifact, `GCMD.app`)

- [ ] The menu bar shows GCMD, File, Edit, View, Help; GCMD > Quit (Cmd+Q) asks about unsaved changes.
- [ ] Cmd+Z/X/C/V/A work in the editor and in the search panel; Cmd+S saves; Cmd+Shift+L toggles the sidebar; Cmd+click opens links.
- [ ] Option+Up/Down move lines, Option+letter still types the special character of the keyboard layout (no menu pops up).
- [ ] Opening a `.md` from the Finder (double-click, drag onto the Dock icon) loads it; a second file opens a second window.
- [ ] The quickbar tooltips show Cmd, not Ctrl.

## Spec harness

- [ ] `npx vitest run src/spec/gfm-spec.test.ts` prints `652/672`; `docs/known-deviations.md` lists exactly the examples in `KNOWN_FAILURES`.
