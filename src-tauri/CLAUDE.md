# Backend conventions (src-tauri/)

Rust 2024 edition, Tauri 2. The backend is deliberately thin: everything that
is not OS integration belongs in the TypeScript frontend.

## What lives here

| Module        | Responsibility                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `lib.rs`      | Builder setup, plugin registration, `generate_handler!` list                                                |
| `document.rs` | Read/write a file as bytes; detect and preserve encoding, BOM, line endings, trailing newline; report mtime |
| `watcher.rs`  | `notify`-based watcher, emits `file-changed` events; ignores our own writes by mtime                        |
| `menu.rs`     | Native menu, recent-files submenu, menu events forwarded to the window                                      |
| `settings.rs` | Versioned JSON settings in the app-config dir; migrations                                                   |
| `cli.rs`      | Launch arguments and macOS `RunEvent::Opened`; resolves to an absolute path                                 |

## Rules

- Commands are thin: parse input, call a plain function, map the error.
  The plain function is what gets unit-tested; it must not depend on Tauri
  types so tests run without a runtime.
- Errors: one `AppError` enum (`thiserror`) per concern, `Serialize`d to the
  frontend as `{ kind, message }`. Never `unwrap`/`expect` outside `main`,
  `run()`, and tests. Clippy pedantic is on; `unsafe` is forbidden.
- Never block the main thread: file I/O and watching run in `async` commands
  or `tauri::async_runtime::spawn`.
- Paths: accept `String` from the frontend, convert to `PathBuf` immediately,
  canonicalize for the recent list, and never log full contents of a file.
- Every new command needs: the `#[tauri::command]`, an entry in
  `generate_handler!`, a typed wrapper in `src/ipc/`, and, if it uses a
  plugin, the matching permission in `capabilities/default.json`. Keep
  permissions minimal; no `fs:default`, no `shell:allow-execute`.
- Multiple instances are a feature: do not add `tauri-plugin-single-instance`.
- Settings and the recent list live outside the install directory (Tauri
  `app_config_dir`) so updates never touch them.

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
