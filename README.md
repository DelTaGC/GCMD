# GCMD

A lightweight, single-document Markdown reader and editor following
[GitHub Flavored Markdown](https://github.github.com/gfm/). Live preview over
the raw text: markup is visible only in the block you are editing, and the
file on disk is never reformatted.

Built with Tauri 2 (Rust shell) and CodeMirror 6 (TypeScript editor).

## Status

Phase 1 (foundation) complete. See [PLAN.md](PLAN.md) for the roadmap and
[docs/decisions](docs/decisions/) for why each technology was chosen.

## Prerequisites

- Node.js 22.22+ (24 recommended, see `.nvmrc`)
- Rust stable with the MSVC toolchain on Windows (`rustup`)
- Windows: Visual Studio Build Tools, "Desktop development with C++" workload
- Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
- macOS: Xcode command line tools

## Commands

| Command                  | What it does                                              |
| ------------------------ | --------------------------------------------------------- |
| `npm install`            | Install dependencies and the pre-commit hook              |
| `npm run app:dev`        | Run the desktop app with hot reload                       |
| `npm run app:build`      | Build installers into `src-tauri/target/release/bundle/`  |
| `npm test`               | Run TypeScript unit tests (Vitest)                        |
| `npm run test:rust`      | Run Rust unit tests                                       |
| `npm run lint`           | ESLint, Prettier check, Clippy                            |
| `npm run format`         | Prettier and rustfmt, in place                            |
| `npm run check`          | Typecheck, lint, and all tests (what CI will run)         |
| `npm run spec:extract`   | Regenerate `tests/fixtures/gfm/spec.json` from `spec.txt` |
| `npm run fixtures:large` | Generate the 1 MB performance document                    |

## License

Not yet decided; all rights reserved until a license file is added.
