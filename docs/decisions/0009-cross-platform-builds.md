# 0009: Linux builds through Docker, all platforms through GitHub Actions

Date: 2026-10-13. Status: Accepted.

## Context

Development happens on Windows 11. Phase 5 asks for the first macOS and
Linux builds and for the platform-specific menu and shortcut differences to
be fixed. The machine has Docker Desktop and a WSL Ubuntu without root, no
macOS, and the repository has no remote yet.

## Options

| Option                                             | Linux                                                   | macOS | Notes                                                            |
| -------------------------------------------------- | ------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| Cross-compile from Windows                         | No (GTK/WebKitGTK sys crates need the native libraries) | No    | Rejected                                                         |
| WSL Ubuntu                                         | Yes, with root                                          | No    | No sudo on this machine; toolchain install not possible          |
| **Docker image with the Tauri prerequisites**      | Yes, reproducible                                       | No    | **Chosen for local Linux checks and bundles**                    |
| **GitHub Actions matrix (ubuntu, macos, windows)** | Yes                                                     | Yes   | **Chosen for macOS and for release builds once a remote exists** |

## Decision

- `tools/linux/Dockerfile` builds `gcmd-linux-build` (Debian bookworm,
  WebKitGTK 4.1, GTK 3, librsvg, stable Rust, Node 24). `tools/linux/run.sh`
  copies the working tree into a fresh container (never a bind mount, so the
  Windows `node_modules` and `target` stay untouched), keeps the cargo and
  npm caches in a named volume, and runs either the whole check suite
  (`npm run linux:check`) or `tauri build` for `.deb` and AppImage
  (`npm run linux:build`, output in `src-tauri/target/linux-bundle/`).
- `.github/workflows/build.yml` runs `npm run check` and `tauri build` on
  ubuntu, macos and windows runners on every push and pull request, and
  uploads the bundles as artifacts. It is the only macOS build path until a
  Mac is available; no signing or notarization yet.
- Platform differences live in the existing modules, not in new ones:
  `menu.rs` adds the macOS application menu (About, Services, Hide, Quit
  through our `file.exit` command so the unsaved prompt runs) and the
  standard Edit items WKWebView needs for Cmd+Z/X/C/V/A; `chrome/menuKeys.ts`
  skips the Alt+letter interception on macOS; the shortcut table already
  uses `Mod`, and menu accelerators `CmdOrCtrl`.

## Consequences

- A Linux-specific test or clippy failure is caught before a commit with
  `npm run linux:check` (the full Rust test suite runs there too, which
  exercises the Unix path and watcher code).
- macOS behavior remains unverified by hand until someone runs the checklist
  in `docs/checklists/phase-5-quality.md` on a Mac; the code paths are
  compiled by CI.
- The Docker image is not part of the release process; installers for users
  come from CI.
