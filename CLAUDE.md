# GCMD

Single-document Markdown reader and editor following GitHub Flavored Markdown
(GFM, https://github.github.com/gfm/). Tauri 2 shell (Rust) + CodeMirror 6
editor (TypeScript, vanilla DOM, Vite). Live preview over the raw text: the
buffer _is_ the markdown; markup shows only in the block being edited.

Roadmap and rationale: `PLAN.md`. Decisions: `docs/decisions/`. Budgets and
measurements: `docs/perf.md`. Parser deviations: `docs/known-deviations.md`.
Releases and updates: `docs/release.md`.
Area-specific rules: `src/CLAUDE.md` (frontend), `src-tauri/CLAUDE.md` (Rust).

## Non-goals

No multi-document workspace, file tree, session restore, citations,
Zettelkasten, or plugin marketplace. One window edits one file; a second file
means a second process.

## Commands

```
npm run app:dev        # desktop app with hot reload (Vite on :1420 + cargo)
npm run app:build      # installers -> src-tauri/target/release/bundle/
npm test               # Vitest; single file: npx vitest run src/spec/gfm-spec.test.ts
npm run test:rust      # cargo test; single: cargo test --manifest-path src-tauri/Cargo.toml <name>
npm run typecheck      # tsc --noEmit
npm run lint           # eslint + prettier --check + clippy -D warnings
npm run format         # prettier --write + cargo fmt
npm run check          # typecheck + lint + both test suites; run before every commit
npm run spec:extract   # regenerate tests/fixtures/gfm/spec.json from spec.txt
npm run fixtures:large # generate tests/fixtures/generated/large.md (1 MB); -- --mb 0.55 --out 20k-lines.md
npm run bench          # DOM-free timings over the generated fixtures (docs/perf.md)
npm run linux:image    # build the Docker image for Linux checks and bundles (once)
npm run linux:check    # npm run check on Linux inside Docker
npm run linux:build    # .deb and AppImage -> src-tauri/target/linux-bundle/
npm run release:version -- X.Y.Z   # set the version everywhere (no arg: check, part of npm run check)
npm run release:build  # signed bundles + .sig (needs TAURI_SIGNING_PRIVATE_KEY)
npm run release:manifest -- --base-url <url> --out-dir <dir>   # latest.json for local update tests
```

Releases come from a `vX.Y.Z` tag through `.github/workflows/release.yml`
(draft GitHub release, published by hand); steps in `docs/release.md`.
License: GPL-3.0-or-later (ADR 0011); new dependencies must be compatible.

Node 24 (see `.nvmrc`, `engines.node` >= 22.22.1). TypeScript stays on the
newest major that `typescript-eslint` supports (check its `peerDependencies`
before bumping TypeScript). In Bash tool calls, `cargo` needs
`export PATH="$HOME/.cargo/bin:$PATH"`.

## Agent environment (Windows, Git Bash)

- Create files with the Write tool, not heredocs: a multi-line
  `cat > file <<'EOF'` whose content contains an apostrophe is rejected
  whole. Write helper scripts to a file and run them with `bash <path>`.
- **Edit files with the Edit tool, or `super_edit` for batched or multi-file replacements,
  not `sed`** (fragile on Windows; fine inside WSL or the containers).
- Windows CLI flags in Git Bash need doubled slashes
  (`taskkill //F //IM App.exe`), otherwise MSYS rewrites them as paths.
- UI checks without a human: `npm run dev` serves the frontend at
  http://localhost:1420 in a plain browser (no IPC; dev builds expose
  `window.gcmd.view` to inject text and inspect state). The real Tauri
  window can be captured and clicked from PowerShell
  (`System.Drawing` `CopyFromScreen` plus `user32` `SetCursorPos` /
  `mouse_event`); `SendKeys` reaches the editor. Alt+F/E/V/H open the
  menus through `chrome/menuKeys.ts` (WebView2 swallows native mnemonics).
- Claude Code runs on the same PC I am using to work on other projects.
  So when you randomly open the app to run tests at the same time I am typing in another window it can
  insert text (document will show dirty) or steal focus. Take back focus and undo to start in a clear state.

## Sub-agents

Delegate to a sub-agent when it keeps your context small (have it return
results and a summary, not test logs), lets independent work run in parallel,
or moves a simple, well-specified change to a cheaper model or lower effort.
Pick the cheapest model and effort that will still succeed. Use the top model
tier for sub-agents sparingly: a few of them can exhaust the 5-hour plan limit.

## Knowledge and docs upkeep

Record knowledge that future sessions need in this repo (a `CLAUDE.md` or
`docs/`) and commit it, rather than only in local machine memory. When a change
makes a file in `docs/` or a `CLAUDE.md` inaccurate, update it in the same
commit.

## Layout

```
src/                  frontend (TypeScript)
  main.ts             bootstrap: args -> open file -> build editor -> wire chrome
  app/                document session (path, dirty state, open/save/close, external-change reload), outline controller
  editor/             CodeMirror assembly, live-preview decorations, commands, keymap, quickbar, outline model, themes
  chrome/             sidebar outline, banners, title (plain DOM)
  ipc/                typed wrappers around Tauri invoke/events; the only place `invoke` is called
  detect/             code-fence language heuristic
  spec/               GFM spec harness
src-tauri/            backend (Rust): document I/O, file watcher, menu, settings, cli
  capabilities/       least-privilege permissions per window
tests/fixtures/       gfm/spec.{txt,json}, sample.md, generated/ (gitignored)
tools/                node scripts (spec extraction, fixture generation)
docs/decisions/       ADRs; docs/checklists/ manual UI verification per phase
```

## Invariants (do not break)

1. **The buffer is the file.** Decorations never modify text. Only explicit
   user commands edit. Save re-encodes with the file's original line endings,
   BOM, encoding, and trailing-newline state. Internally the editor holds LF.
2. **Active-block rule.** Markup is visible when any selection range touches
   the node's block (inline marks: the line; fences, tables, mermaid: the whole
   block). Otherwise it is styled or replaced by a widget.
3. **Commands registry.** Every editing action is a named command in
   `src/editor/commands/`. Menus, quickbar, shortcuts, and future LLM hooks call
   the registry; nothing else mutates the editor.
4. **Single keymap table** in `src/editor/keymap.ts`. Never bind the backtick,
   `^`, `¨`, or `´` (dead keys on the user's Swiss-French QWERTZ layout).
   Inline code is Ctrl+E. Ctrl+D duplicates the line. No multi-cursor features.
5. **Lazy heavy things.** Mermaid, non-core languages, anything over ~100 KB:
   dynamic `import()` only. Startup bundle under 1 MB gzip. Cold start to
   editable under 1 s; 1 MB document opens under 500 ms; typing latency under
   16 ms at the end of a 20k-line file. `docs/perf.md` says how each is
   measured and holds the last numbers; re-measure after parser,
   live-preview or bundle changes.
6. **No process-level state.** No single-instance plugin. No session restore.
   Only window geometry, settings, and the recent-files list persist.
7. **Versioned settings** (`schemaVersion`) in the OS app-config dir, migrated
   forward, never deleted by an update.
8. **Least-privilege IPC.** Each Rust command has exactly the permission it
   needs in `src-tauri/capabilities/`. File access goes through our typed
   commands, never the generic fs plugin.
9. **Open only what is asked.** Launch with no file shows an empty document.

## Conventions

- TypeScript strict with the extra flags in `tsconfig.json`; no `any`, no
  non-null assertions, explicit return types on exported functions.
- Rust: clippy pedantic clean, `unsafe` forbidden, errors returned as
  `Result<T, AppError>` (see `src-tauri/CLAUDE.md`).
- Logic gets unit tests (Vitest, cargo test). UI gets a manual checklist in
  `docs/checklists/`; update the checklist when you add UI.
- Commits: `type(scope): summary` with types feat, fix, refactor, test, docs,
  chore, perf. One commit per phase milestone at least; smaller is fine.
- Pre-commit hook (simple-git-hooks + lint-staged) runs eslint, prettier,
  rustfmt on staged files. Do not bypass it.
- New technology choice: add an ADR in `docs/decisions/` before using it.
- Keep `PLAN.md` phase status current when a phase completes.

## Verifying a change

1. `npm run check` is green.
2. `npm run app:dev`, open `tests/fixtures/sample.md`, walk the relevant
   checklist in both themes.
3. For file I/O changes: edit, save, `git diff` the fixture shows only the
   intended lines (no EOL or whitespace churn).

## Screenshots

Downscale screenshots before analyzing them, for speed and cost:
`magick input.png -resize '768x768>' output.jpg` (never upscales; `magick mogrify -resize '768x768>' -format jpg *.png` for a batch).
Keep full resolution when the check depends on fine detail (small text, 1px borders, alignment), or crop the region instead: `magick input.png -crop WxH+X+Y +repage out.png`.
If `magick` is missing, install a temporary portable copy for the session and tell the user so they can install it properly.
