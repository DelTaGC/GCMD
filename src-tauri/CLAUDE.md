# Backend conventions (src-tauri/)

Rust 2024 edition, Tauri 2. The backend is deliberately thin: everything that
is not OS integration belongs in the TypeScript frontend.

## What lives here

| Module        | Responsibility                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `lib.rs`      | Builder setup, plugin registration, `generate_handler!` list                                                |
| `document.rs` | Read/write a file as bytes; detect and preserve encoding, BOM, line endings, trailing newline; report mtime |
| `watcher.rs`  | `notify` watcher on the document's directory, debounced, emits `file-changed` with the current mtime        |
| `menu.rs`     | Native menu, recent-files submenu, menu events forwarded to the window                                      |
| `settings.rs` | Versioned JSON settings in the app-config dir; migrations                                                   |
| `cli.rs`      | Launch arguments and macOS `RunEvent::Opened`; resolves to an absolute path                                 |
| `paths.rs`    | Resolves markdown hrefs (relative, absolute, `file://`) to existing files next to the open document         |
| `updater.rs`  | Self-update (ADR 0010): check, download + install + restart, other-instance guard on Windows                |

## Rules

- Commands are thin: parse input, call a plain function, map the error.
  The plain function is what gets unit-tested; it must not depend on Tauri
  types so tests run without a runtime.
- Errors: one `AppError` enum (`thiserror`) per concern, `Serialize`d to the
  frontend as `{ kind, message }`. Never `unwrap`/`expect` outside `main`,
  `run()`, and tests. Clippy pedantic is on; `unsafe` is forbidden.
- Never block the main thread: file I/O and watching run in `async` commands
  or `tauri::async_runtime::spawn`. The watcher delivers events from its own
  thread and `emit`s them; one watcher per process lives in `AppState`, and
  the frontend (not Rust) decides whether a change is our own save.
- Paths: accept `String` from the frontend, convert to `PathBuf` immediately,
  canonicalize for the recent list, and never log full contents of a file.
- Every new command needs: the `#[tauri::command]`, an entry in
  `generate_handler!`, a typed wrapper in `src/ipc/`, and, if it uses a
  plugin, the matching permission in `capabilities/default.json`. Keep
  permissions minimal; no `fs:default`, no `shell:allow-execute`.
- Images load through the `asset:` protocol. The scope in `tauri.conf.json`
  stays empty (never a static `**`); `resolve_asset` allows each resolved
  image file one by one at runtime (`asset_protocol_scope().allow_file`).
- Multiple instances are a feature: do not add `tauri-plugin-single-instance`.
- Menus: accelerators use `CmdOrCtrl` and mirror `src/editor/keymap.ts`
  (a frontend test parses `menu.rs`, so write them as `Some("...")` literals
  next to the command id, or as a named constant when the key is menu-only
  like Exit). macOS gets the application menu and the predefined Edit items
  in `menu.rs`; keep every `cfg!(target_os)` branch there.
- `rust-version` in `Cargo.toml` is also what the cargo resolver uses to pick
  dependency versions; keep it at the oldest toolchain that compiles the
  code (let chains need 1.88). When `tauri build` reports mismatched npm and
  crate versions, run `cargo update -p tauri --precise <npm version>`.
- Linux: `npm run linux:check` runs the whole check suite in Docker
  (`tools/linux/`); do it before committing changes to paths, the watcher
  or the menu. macOS builds come from CI only (ADR 0009).
- Settings and the recent list live outside the install directory (Tauri
  `app_config_dir`) so updates never touch them. New settings fields carry
  `#[serde(default)]` so older files load without a schema bump. An
  unreadable `settings.json` is renamed to `settings.invalid.json` at
  startup (`settings::load_or_recover`) before defaults could overwrite it;
  a UTF-8 BOM is accepted.
- The updater plugin is used from Rust only (`updater.rs`); never grant the
  frontend `updater:*` or `process:*` permissions. On Windows the NSIS
  installer force-closes every process of the installed exe, so
  `updater::install` must keep refusing while other GCMD processes run.
- Dependencies must be GPLv3-compatible (ADR 0011): check the license of a
  new crate and of what it pulls in.

## Testing

- `cargo test` from this directory or `npm run test:rust` from the root.
- Document I/O tests use `tempfile` and cover: UTF-8 with and without BOM,
  CRLF and LF, mixed endings (dominant wins), missing trailing newline,
  empty file, and a non-UTF-8 file (reported as an error, never silently
  re-encoded).
- `cargo clippy --all-targets -- -D warnings` must be clean.

## Build notes

- Icons in `icons/` are generated from `../icon/gcmd-icon.png` with
  `npx tauri icon icon/gcmd-icon.png`; do not edit them by hand.
- `tauri.conf.json` owns file associations (`md`, `markdown`), window
  defaults, CSP, and bundle metadata. The app identifier is
  `ch.gaetancretton.gcmd` and must not change (it keys settings and updates).
- `bundle.resources` ships `../LICENSE` (as `LICENSE.txt`) and
  `../THIRD-PARTY-NOTICES.md` next to the executable; `app_info` reports the
  notices path for Help > About. `tauri-build` copies resources in every
  cargo build, so both files must exist (the notices file is committed;
  regenerate it with `npm run licenses` after dependency changes).
- `version` in `tauri.conf.json` is `"../package.json"`; set versions only
  with `npm run release:version -- X.Y.Z` (docs/release.md).
- `tauri.release.conf.json` turns on `createUpdaterArtifacts`, which needs
  `TAURI_SIGNING_PRIVATE_KEY`; plain `tauri build` does not use it. The
  updater `pubkey` and endpoint in `tauri.conf.json` are release-critical:
  changing the key strands installed copies.
