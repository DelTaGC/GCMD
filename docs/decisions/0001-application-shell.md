# 0001: Tauri 2 as the application shell

Date: 2026-10-12. Status: Accepted.

## Context

GCMD must run on Windows 11, macOS, and Linux, start fast, use little memory,
register as the default `.md` application, run as many independent instances
as the user opens, and later self-update without losing settings. The current
tool (Zettlr, Electron) is rejected mainly for its footprint.

## Options

| Option                          | Binary / RAM       | File association, updater | Risk                                                           |
| ------------------------------- | ------------------ | ------------------------- | -------------------------------------------------------------- |
| Tauri 2 (Rust + system webview) | ~5-10 MB, 30-60 MB | Built in                  | Rust toolchain on each build machine; webview differences      |
| Electron                        | ~150 MB, 150+ MB   | Via electron-builder      | The footprint being replaced                                   |
| Native toolkit (egui, iced, Qt) | Smallest           | Manual                    | A WYSIWYG markdown editor from scratch is a multi-month detour |

## Decision

Tauri 2. The Rust side is limited to OS integration (file I/O, watching,
menus, window state, settings, CLI). All editing runs in the webview.
Multiple instances are the default behavior; the single-instance plugin is
explicitly not used.

## Consequences

- Rendering differs slightly between WebView2, WKWebView, and WebKitGTK;
  CSS stays conservative and both themes are checked on each platform.
- Cross-platform builds happen on the target OS (or CI later). No signing
  for now; macOS users right-click > Open on first launch.
- The updater (`tauri-plugin-updater`) is a later phase, but settings already
  live in the app-config dir so updates cannot remove them.
