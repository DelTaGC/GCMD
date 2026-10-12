# Phase 1: foundation

- [ ] `npm install` on a fresh clone installs the pre-commit hook (`.git/hooks/pre-commit` exists).
- [ ] `npm run check` is green (typecheck, eslint, prettier, clippy, vitest, cargo test).
- [ ] `npm run app:dev` opens a window titled "GCMD" showing the app name and version.
- [ ] The window icon is the GCMD icon (title bar and taskbar).
- [ ] Launching the app twice gives two independent windows.
- [ ] Staging a badly formatted `.ts` file and committing reformats it or blocks the commit.
- [ ] `npm run fixtures:large` writes a ~1 MB file under `tests/fixtures/generated/` and that folder is ignored by git.
