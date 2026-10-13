# Architecture decision records

One short file per decision. Status is Accepted unless noted. Add a new ADR
before introducing a new technology or changing one of these.

| ADR                                              | Decision                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| [0001](0001-application-shell.md)                | Tauri 2 as the application shell                                  |
| [0002](0002-editor-engine.md)                    | CodeMirror 6 with live-preview decorations                        |
| [0003](0003-markdown-parser.md)                  | Lezer-markdown with a GFM spec harness                            |
| [0004](0004-ui-layer.md)                         | Vanilla TypeScript + Vite for the chrome                          |
| [0005](0005-save-fidelity.md)                    | Byte-faithful save, explicit save only                            |
| [0006](0006-tauri-plugins-and-settings.md)       | Dialog and window-state plugins; own versioned settings           |
| [0007](0007-block-widgets-mermaid-and-assets.md) | Block widgets as state fields; lazy mermaid; per-file asset scope |
| [0008](0008-file-watcher.md)                     | `notify` watcher on the parent directory; the frontend reconciles |
| [0009](0009-cross-platform-builds.md)            | Linux builds through Docker, all platforms through GitHub Actions |
| [0009](0009-cross-platform-builds.md)            | Linux builds through Docker, all platforms through GitHub Actions |
