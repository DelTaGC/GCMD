# GCMD

Single-document Markdown reader and editor following GitHub Flavored Markdown
(GFM, https://github.github.com/gfm/). Tauri 2 shell (Rust) + CodeMirror 6
editor (TypeScript, vanilla DOM, Vite). Live preview over the raw text: the
buffer _is_ the markdown; markup shows only in the block being edited.

Roadmap and rationale: `PLAN.md`. Decisions: `docs/decisions/`.
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
npm run fixtures:large # generate tests/fixtures/generated/large.md (1 MB)
```

Node 24 (see `.nvmrc`, `engines.node` >= 22.22.1). TypeScript stays on the
newest major that `typescript-eslint` supports (check its `peerDependencies`
before bumping TypeScript). In Bash tool calls, `cargo` needs
`export PATH="$HOME/.cargo/bin:$PATH"`.

## Layout

```
src/                  frontend (TypeScript)
  main.ts             bootstrap: args -> open file -> build editor -> wire chrome
  editor/             CodeMirror assembly, live-preview decorations, commands, keymap, themes
  chrome/             sidebar, quickbar, banners, title (plain DOM)
  ipc/                typed wrappers around Tauri invoke/events; the only place `invoke` is called
  detect/             code-fence language heuristic
  spec/               GFM spec harness
src-tauri/            backend (Rust): document I/O, watcher, menu, settings, cli
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
   16 ms at the end of a 20k-line file.
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
