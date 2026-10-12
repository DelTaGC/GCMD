# 0006: Tauri plugins for dialogs and window state; hand-written settings

Date: 2026-10-12. Status: Accepted.

## Context

Phase 2 needs native file pickers, a three-button "unsaved changes" prompt,
window geometry persistence, and a versioned settings file for the theme and
the recent list. Each could be a Tauri plugin or our own Rust code.

## Decision

- `tauri-plugin-dialog` for open/save pickers and message dialogs. Its
  `YesNoCancel` buttons give the Save / Don't Save / Cancel prompt natively.
  Only `dialog:allow-open`, `dialog:allow-save` and `dialog:allow-message`
  are granted.
- `tauri-plugin-window-state` to restore window size and position. This is
  the only process-level state besides settings (invariant 6). Several
  instances share one state file; the last closed window wins.
- Settings are our own `settings.rs`: a `schemaVersion`ed JSON file in the
  app-config directory, parsed leniently with serde defaults, unknown keys
  preserved through `#[serde(flatten)]`, and a `migrate` step. No
  `tauri-plugin-store`: the schema-version and migration rules (invariant 7)
  are easier to guarantee in forty lines than around a generic key-value
  store.
- No single-instance plugin, no fs plugin (invariants 6 and 8).

## Consequences

- The frontend's `ipc/dialog.ts` is the only module that calls the dialog
  plugin; everything else asks the session.
- New windows are separate processes spawned from `current_exe()`.
- Adding a plugin later needs its permission listed in
  `capabilities/default.json` and a note in this file or a new ADR.
