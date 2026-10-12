# GCMD — Implementation Plan

GCMD is a single-document Markdown reader and editor following GitHub Flavored
Markdown (GFM). It replaces Zettlr for one-file-at-a-time use: fast to open,
light on memory, faithful to the file on disk, and WYSIWYG in the
"live preview" sense (markup is visible only in the block being edited).

This plan records the decisions taken during the Q&A, the technology
comparison, the architecture, and the phased delivery. Phase 1 creates the
CLAUDE.md files that will guide every later session.

---

## 1. Requirements (consolidated)

### Must have

| Area           | Requirement                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platforms      | Windows 11, macOS, Linux                                                                                                                                                                                           |
| Footprint      | Fast cold start, low RAM/CPU, smooth on ~1 MB / 20k-line files                                                                                                                                                     |
| OS integration | Registrable as default app for `.md` (Windows first), file passed via double-click, CLI argument, drag-and-drop                                                                                                    |
| Instances      | Many independent windows/processes, no single-instance lock, no session restore                                                                                                                                    |
| Menu           | New, Open, Save, Save As, Recent files, Exit; View: sidebar toggle, dark/light toggle                                                                                                                              |
| Editing model  | Live preview over raw text: the buffer _is_ the markdown; the active line/block shows its syntax                                                                                                                   |
| Save           | Explicit Ctrl+S, dirty marker in title, prompt on close; original line endings, encoding, BOM, trailing newline preserved; never reformat on save                                                                  |
| Sidebar        | Collapsible heading outline, click to jump, current section highlighted                                                                                                                                            |
| Quickbar       | On selection: bold, italic, inline code, strikethrough, link, heading level, clear formatting                                                                                                                      |
| Code blocks    | Syntax highlighting; language dropdown on the fence; auto-detect for _unlabeled_ fences only; core languages bundled, others lazy                                                                                  |
| GFM extensions | Task lists (clickable), strikethrough, autolinks, tables, plus mermaid diagrams                                                                                                                                    |
| Tables         | Rendered widget when cursor is outside, raw pipes when inside; Tab/Shift+Tab between cells; pipes auto-aligned when leaving the block (an undoable buffer edit, not a save-time rewrite)                           |
| Mermaid        | Library loaded lazily on first mermaid fence; diagram replaces the fence when inactive; errors shown inline                                                                                                        |
| Reader         | Local relative images rendered inline when inactive; Ctrl+click opens http(s) links in the browser and `.md` links in a new GCMD window                                                                            |
| Window         | Size and position remembered; never which file was open                                                                                                                                                            |
| Keyboard       | Typora/Obsidian formatting shortcuts + VS Code editing shortcuts; Ctrl+D duplicates the line; inline code on Ctrl+E (backtick is a dead key on Swiss-French QWERTZ); whole keymap in one table for later remapping |
| File watch     | Reload silently when the file changes on disk and the buffer is clean; banner with Reload / Keep when dirty                                                                                                        |

### Not needed

Citations, multi-document workspace, file tree, Zettelkasten, session restore.

### Later (architecture must not block them)

Self-update that keeps settings; settings UI (font, sizes, colors, shortcuts);
dictionary/spell-check; LLM/agent hooks (rewrite, translate, import tables).

---

## 2. Technology comparison

### Application shell

| Option                              | Startup / RAM                 | Cross-platform | File association + updater                                   | Verdict                                                                |
| ----------------------------------- | ----------------------------- | -------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Tauri 2** (Rust + system webview) | ~5–10 MB binary, 30–60 MB RAM | Win/Mac/Linux  | Built in (`bundle.fileAssociations`, `tauri-plugin-updater`) | **Chosen**                                                             |
| Electron                            | ~150 MB install, 150+ MB RAM  | Win/Mac/Linux  | electron-builder + electron-updater                          | Rejected: the Zettlr footprint problem                                 |
| Native (egui/iced/Qt)               | Smallest                      | Yes            | Manual                                                       | Rejected: WYSIWYG markdown editor from scratch is a multi-month detour |

Tauri notes: WebView2 is already present on Windows 11; macOS uses WKWebView;
Linux uses WebKitGTK. The Rust side stays small: file I/O, watching, menus,
window state, settings, CLI args. All editing logic lives in TypeScript.

### Editor engine

| Option                          | Model                            | Large files                           | Round-trip fidelity        | Verdict                                                    |
| ------------------------------- | -------------------------------- | ------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| **CodeMirror 6**                | Text buffer + decorations        | Viewport rendering, incremental parse | Exact (buffer is the file) | **Chosen** (also used by Obsidian Live Preview and Zettlr) |
| ProseMirror / Tiptap / Milkdown | Node tree, serialize to markdown | Whole-document DOM                    | Lossy (reformats)          | Rejected: violates "never reformat" and the 1 MB target    |
| contenteditable from scratch    | —                                | —                                     | —                          | Rejected                                                   |

### Markdown parser

| Option                                                 | Incremental        | GFM coverage                                                        | Runs where                           | Verdict                                                                                                                                         |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lezer-markdown** (`@lezer/markdown` + GFM extension) | Yes, per keystroke | Tables, task lists, strikethrough, autolink; ~95 % CommonMark-exact | Frontend, feeds decorations directly | **Chosen**                                                                                                                                      |
| micromark / remark                                     | No (full reparse)  | 100 % GFM                                                           | Frontend                             | Not for editing; kept as an option for HTML export later                                                                                        |
| markdown-it                                            | No                 | GFM via plugins                                                     | Frontend                             | Same as above                                                                                                                                   |
| pulldown-cmark / comrak (Rust)                         | No                 | Full GFM                                                            | Backend                              | IPC round-trip per keystroke is too slow for live preview; candidate for export only                                                            |
| Custom parser                                          | Would have to be   | Whatever we implement                                               | Frontend                             | Rejected for now: weeks of work before a usable build; Lezer deviations are patched instead, measured by a GFM spec-test suite kept in the repo |

### UI layer

Vanilla TypeScript + Vite. No framework runtime; the chrome (menu wiring,
sidebar, quickbar, banners) is a few hundred lines of DOM code. Native OS
menus come from Tauri's menu API, not HTML.

### Supporting libraries

| Need                 | Choice                                                                            | Why                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code highlighting    | `@codemirror/language` + `@codemirror/language-data`                              | Core set imported eagerly (JS/TS, Python, Rust, Go, Java, C/C++/C#, HTML/CSS, JSON/YAML/TOML, Shell/PowerShell, SQL, Markdown); all others lazy via `language-data` |
| Language auto-detect | Small in-house heuristic (keyword/shebang/brace scoring) over the core set        | highlight.js auto-detect would pull ~1 MB; heuristic is a few KB and only runs on unlabeled fences                                                                  |
| Diagrams             | `mermaid` via dynamic `import()`                                                  | ~2.5 MB; must never be in the startup bundle                                                                                                                        |
| Settings store       | `tauri-plugin-store` → JSON in the OS app-config dir                              | Lives outside the install dir, so updates never touch it                                                                                                            |
| Window geometry      | `tauri-plugin-window-state` (size/position only)                                  | —                                                                                                                                                                   |
| Dialogs, shell       | `tauri-plugin-dialog`, `tauri-plugin-opener`                                      | Open/Save dialogs, open links externally                                                                                                                            |
| File watch           | `notify` crate in Rust                                                            | Emits `file-changed` events to the window                                                                                                                           |
| Encoding             | `encoding_rs` + BOM sniffing in Rust                                              | Read as bytes, decode, remember metadata, re-encode on save                                                                                                         |
| Tests                | Vitest (TS), `cargo test` (Rust)                                                  | GFM spec fixtures from the official spec JSON                                                                                                                       |
| Lint/format          | ESLint + Prettier, `cargo clippy` + `rustfmt`, `simple-git-hooks` + `lint-staged` | Enforced on commit                                                                                                                                                  |

### Toolchain prerequisites on this machine

- Node 24 is installed (`.nvmrc`); current Vite, Vitest, ESLint, and lint-staged run on it. TypeScript follows what `typescript-eslint` supports.
- Rust is **not** installed: `rustup` (stable, MSVC target) and the Visual Studio Build Tools "Desktop development with C++" workload are required before `cargo` can build. WebView2 runtime is already part of Windows 11.
- macOS and Linux builds happen later on those machines (or CI); no signing for now.

---

## 3. Architecture

```
GCMD/
├── CLAUDE.md                 # project guide for Claude (phase 1)
├── PLAN.md                   # this file
├── package.json, vite.config.ts, tsconfig.json, eslint/prettier config
├── src/                      # frontend (TypeScript)
│   ├── CLAUDE.md             # frontend conventions
│   ├── main.ts               # bootstrap: load file from args, build editor, wire chrome
│   ├── editor/
│   │   ├── create.ts         # EditorState/EditorView assembly
│   │   ├── livePreview/      # decoration plugins, one file per element family
│   │   │   ├── activeBlock.ts   # "is the cursor inside this node?" logic
│   │   │   ├── inline.ts        # bold/italic/code/strike/link marks
│   │   │   ├── headings.ts, lists.ts, blockquote.ts, hr.ts
│   │   │   ├── codeFence.ts     # highlighting, language dropdown, auto-detect
│   │   │   ├── table.ts         # widget + raw mode + align-on-exit
│   │   │   ├── mermaid.ts       # lazy renderer widget
│   │   │   └── image.ts
│   │   ├── commands/         # every editing action as a named command
│   │   ├── keymap.ts         # THE single shortcut table
│   │   └── theme/            # light + dark CSS variables
│   ├── chrome/               # sidebar, quickbar, banners, title
│   ├── ipc/                  # typed wrappers around Tauri invoke/events
│   ├── detect/               # language heuristic
│   └── spec/                 # GFM spec-test harness
├── src-tauri/                # backend (Rust)
│   ├── CLAUDE.md             # Rust conventions
│   ├── tauri.conf.json       # bundle, fileAssociations, windows
│   ├── capabilities/         # least-privilege permissions
│   └── src/
│       ├── main.rs, lib.rs
│       ├── document.rs       # read/write with encoding + EOL metadata
│       ├── watcher.rs        # notify → events
│       ├── menu.rs           # native menu + recent files
│       ├── settings.rs       # store access, schema version
│       └── cli.rs            # argv / macOS open-file events
└── tests/                    # fixtures: GFM spec.json, sample documents, 1 MB perf doc
```

### Key design rules

1. **The buffer is the file.** Decorations never change text; only explicit commands do. Save re-encodes the buffer with the original EOL, BOM, encoding, and trailing-newline state. Internally CodeMirror holds LF.
2. **Active-block rule.** A node's markup is shown when the primary selection head (or any selection range) touches the node's _block_ (for inline marks: the line; for fences/tables/mermaid: the whole block). Everything else is decorated or replaced by a widget.
3. **Commands registry.** Every action (toggle bold, duplicate line, set heading level, set fence language…) is a named command in `editor/commands/`. Menus, quickbar, shortcuts, and future LLM hooks call the same registry.
4. **Lazy heavy things.** Mermaid, non-core languages, and anything over ~100 KB are dynamic imports. Startup bundle budget: under 1 MB gzip; cold start to editable under 1 s on this machine.
5. **No process-level state.** No single-instance plugin, no session restore. Window geometry is the only thing remembered between runs besides settings and the recent list.
6. **Settings are versioned JSON** in the app-config dir with a `schemaVersion`, migrated forward, never deleted by updates.
7. **Least-privilege IPC.** Tauri capabilities expose only the commands the frontend needs; file access goes through typed Rust commands, not the generic fs plugin.

### Flows

- **Open:** argv / `RunEvent::Opened` / dialog → `document::read` returns `{ text(LF), eol, encoding, bom, trailingNewline, mtime }` → editor state built → watcher started → recent list updated.
- **Save:** editor text → `document::write(path, text, meta)` → mtime recorded so the watcher ignores our own write → dirty flag cleared.
- **External change:** watcher event → if `!dirty` reload silently, else show banner.
- **Open `.md` link / "New window":** spawn a new GCMD process with the path as argument.

---

## 4. Phases

Each phase ends with: tests green, lint clean, a manual verification checklist run, and one git commit.

### Phase 0 — Prerequisites (you) — DONE 2026-10-12

- Install `rustup` (stable-msvc) and Visual Studio Build Tools with the C++ workload.
- Node 24 installed (done).
- **Done when:** `cargo --version` and `node --version` both work in a fresh terminal.

### Phase 1 — Foundation and CLAUDE.md files — DONE 2026-10-12

1. `git init`, `.gitignore`, `.editorconfig`.
2. Scaffold Tauri 2 + Vite vanilla-TS app named GCMD (`create-tauri-app`), pinned versions.
3. Tooling: strict `tsconfig`, ESLint, Prettier, Vitest, `cargo clippy`/`rustfmt` config, `simple-git-hooks` + `lint-staged` pre-commit.
4. **Root `CLAUDE.md`** containing:
   - one-paragraph purpose and explicit non-goals;
   - commands: dev, build, test, lint, format, how to run a single test;
   - architecture map (the tree above) and where each concern lives;
   - invariants (the seven design rules), phrased as rules Claude must not break;
   - performance budgets and how to measure them;
   - testing policy: logic gets unit tests, UI gets a manual checklist in `docs/checklists/`;
   - commit conventions and the per-phase commit habit;
   - decision log pointer (`docs/decisions/`), one short ADR per technology choice above;
   - keyboard constraints (Swiss-French QWERTZ, Ctrl+E for inline code, Ctrl+D duplicate line).
5. **`src/CLAUDE.md`**: frontend conventions — vanilla DOM, no framework, CodeMirror extension structure, decoration/active-block rules, lazy-import rule, command-registry rule, how to add a new live-preview element.
6. **`src-tauri/CLAUDE.md`**: Rust conventions — commands are thin, errors as `Result<_, String>` mapped to typed frontend errors, capabilities least-privilege, never block the main thread, how to add a command and its permission.
7. `docs/decisions/` with ADRs: shell, editor engine, parser, UI layer, save-fidelity policy.
8. `tests/fixtures/`: GFM `spec.json` downloaded, a sample document covering every feature, a generated 1 MB document.
9. Empty app builds, opens a window, `npm test` and `cargo test` pass with placeholder tests.

- **Done when:** fresh clone + `npm install` + `npm run tauri dev` shows a window; hooks block an unformatted commit; first commit made.

### Phase 2 — Usable editor (daily-use candidate) — DONE 2026-10-12

- Rust: `document.rs` read/write with encoding, BOM, EOL, trailing-newline preservation and unit tests; `cli.rs` argv + macOS open events; native menu with New/Open/Save/Save As/Recent/Exit, View: sidebar (placeholder), dark/light toggle; window-state plugin; `fileAssociations` for `.md`/`.markdown`.
- Frontend: CodeMirror 6 with Lezer GFM; live preview for headings, emphasis, strong, inline code, strikethrough, links, autolinks, lists, task checkboxes (clickable), blockquotes, horizontal rules, fenced code with core-language highlighting; dirty marker; close prompt; light and dark themes with the menu toggle; keymap table v1 (formatting + Ctrl+D + VS Code line moves); find/replace (CodeMirror built-in).
- Tests: document round-trip (CRLF/LF/BOM/UTF-8/no trailing newline), active-block logic, GFM spec harness reporting pass/fail counts (not yet gating).
- **Done when:** you can set GCMD as the default `.md` app on Windows, double-click a file, edit, save, and `git diff` shows only the lines you changed.

### Phase 3 — Blocks

- Tables: widget rendering, raw mode on entry, Tab/Shift+Tab cell navigation, align-on-exit command.
- Mermaid: lazy load, SVG widget, source on click, inline errors, render cache by content hash.
- Code fences: language dropdown widget, heuristic auto-detect for unlabeled fences, lazy loading of non-core languages.
- Images: inline local images relative to the file; Ctrl+click on links.
- **Done when:** the sample document renders every block correctly in both themes with no cursor jumps when entering/leaving blocks.

### Phase 4 — Navigation and editing UX

- Sidebar outline: heading tree, collapsible nodes, click-to-jump, active section tracking, toggle in View menu.
- Quickbar: appears on non-empty selection with bold, italic, inline code, strikethrough, link, heading level, clear formatting; keyboard-dismissable.
- File watcher: silent reload when clean, banner when dirty.
- Keymap v2 complete; shortcuts shown in menus.
- **Done when:** manual checklist for sidebar, quickbar, and external-change scenarios passes.

### Phase 5 — Quality and performance

- GFM spec harness becomes gating for the subset Lezer is expected to pass; documented deviation list with fixes or `known-deviations.md`.
- Benchmarks: cold start, open 1 MB doc, typing latency at end of 20k-line doc, memory after 10 minutes of editing; recorded in `docs/perf.md` with budgets.
- First macOS and Linux builds; fix platform-specific menu/shortcut differences (Cmd vs Ctrl).
- **Done when:** budgets met on Windows and the app runs on at least one other platform.

### Phase 6 — Later features (designed for, not built now)

- **Self-update:** `tauri-plugin-updater` with signed artifacts; settings already live outside the install dir.
- **Settings UI:** schema in `settings.rs`, panel in `chrome/settings/`; font, sizes, colors, keymap editor (reads the same keymap table).
- **Dictionary:** enable the webview's native spell-check first (WebView2/WKWebView/WebKitGTK), custom word list in settings; a bundled Hunspell path only if native proves insufficient.
- **LLM hooks:** a `transform` command family (selection in, text out) with a provider interface in Rust (HTTP, keys in OS keychain); exposed through the command registry so menus, shortcuts, and quickbar can trigger them.

---

## 5. Risks and mitigations

| Risk                                             | Mitigation                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Rust toolchain setup friction on Windows         | Phase 0 is explicit; everything else is JS until the shell is needed                                         |
| Lezer deviations from GFM surprising you         | Spec harness from phase 1; deviations listed, fixed by extension or documented                               |
| Cursor glitches around widgets (the Zettlr pain) | Active-block logic isolated and unit-tested; widgets are atomic ranges; every element family in its own file |
| Mermaid/language bundles bloating startup        | Bundle-size check in CI/lint step; dynamic imports only                                                      |
| Swiss-French layout shortcut collisions          | Keymap table is data; Ctrl+E for inline code; verified on your keyboard during phase 2                       |
| macOS file-open events differ from argv          | `cli.rs` handles both from phase 2 even though Mac builds come later                                         |

---

## 6. Open points to confirm during phase 1

- App identifier (e.g. `ch.gaetan.gcmd`) and icon.
- Exact wording of the close-prompt and the external-change banner.
- Whether `.markdown` and `.txt` should also be associated.
