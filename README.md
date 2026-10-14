# GCMD

A lightweight, single-document Markdown reader and editor following
[GitHub Flavored Markdown](https://github.github.com/gfm/). Live preview over
the raw text: markup is visible only in the block you are editing, and the
file on disk is never reformatted.

Built with Tauri 2 (Rust shell) and CodeMirror 6 (TypeScript editor).

## Status

Daily-use editor on Windows, with Linux and macOS builds: live preview,
tables, Mermaid, outline, byte-faithful save, and self-update from GitHub
releases. See [PLAN.md](PLAN.md) for the roadmap,
[CHANGELOG.md](CHANGELOG.md) for releases and
[docs/decisions](docs/decisions/) for why each technology was chosen.

## Install

Download the installer for your platform from the [GitHub releases page](https://github.com/DelTaGC/GCMD/releases)
(Windows `-setup.exe`, macOS `.dmg`, Linux `.deb` or `.AppImage`). The builds
are not code-signed yet: on Windows choose "More info > Run anyway" in
SmartScreen, on macOS right-click the app > Open the first time. GCMD then
updates itself: it checks once a day and asks before installing
(Help > Check for Updates).

## Prerequisites

- Node.js 22.22+ (24 recommended, see `.nvmrc`)
- Rust stable with the MSVC toolchain on Windows (`rustup`)
- Windows: Visual Studio Build Tools, "Desktop development with C++" workload
- Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
- macOS: Xcode command line tools

## Commands

| Command                            | What it does                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `npm install`                      | Install dependencies and the pre-commit hook                                     |
| `npm run app:dev`                  | Run the desktop app with hot reload                                              |
| `npm run app:dev -- -- <abs path>` | Same, opening a file (path is absolute; the binary runs from `src-tauri/`)       |
| `npm run app:build`                | Build installers into `src-tauri/target/release/bundle/`                         |
| `npm test`                         | Run TypeScript unit tests (Vitest)                                               |
| `npm run test:rust`                | Run Rust unit tests                                                              |
| `npm run lint`                     | ESLint, Prettier check, Clippy                                                   |
| `npm run format`                   | Prettier and rustfmt, in place                                                   |
| `npm run check`                    | Typecheck, lint, and all tests (what CI will run)                                |
| `npm run spec:extract`             | Regenerate `tests/fixtures/gfm/spec.json` from `spec.txt`                        |
| `npm run fixtures:large`           | Generate the 1 MB performance document                                           |
| `npm run release:version -- X.Y.Z` | Set the app version in every file (releases: [docs/release.md](docs/release.md)) |

## License

Copyright (C) 2026 Gaetan Cretton.

GCMD is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

Third-party components keep their own licenses (MIT, Apache-2.0, ISC, BSD,
MPL-2.0 and others; see [ADR 0011](docs/decisions/0011-license.md)).
