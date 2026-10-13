# 0008: File watching with `notify` and a debouncer

Date: 2026-10-13. Status: Accepted.

## Context

Phase 4 reloads the document when another program changes it on disk:
silently while the buffer is clean, through a Reload / Keep banner while it
is dirty. The watch must survive editors that save by renaming a temporary
file over the original, must not fire for our own saves, and must not block
the main thread.

## Decision

- `notify` (through `notify-debouncer-mini`) in Rust, as planned in
  `PLAN.md`. The parent directory is watched non-recursively and events are
  filtered by file name, so atomic saves keep working. A 200 ms debounce
  turns the burst of events one save produces into one `file-changed`
  event carrying the file's current modification time (`None` when it is
  gone).
- One watcher per process, owned by `AppState` and replaced by
  `watch_document` / dropped by `unwatch_document`. One window edits one
  file (invariant 6), so a list of watchers is unnecessary.
- The frontend decides. `app/session.ts` remembers the modification time
  it last read or wrote; an event with that time is its own save and is
  ignored. Otherwise a clean buffer is re-read and the difference applied as
  one minimal edit (`app/reload.ts`), which keeps the cursor and scroll
  position and leaves the previous text in the undo history. A dirty buffer
  gets the banner. Content comparison in the frontend, not in Rust, keeps
  the Rust side free of document state.
- No `tauri-plugin-fs` watch API: it would require the generic fs
  permission set (invariant 8).

## Consequences

- `notify` pulls platform backends (`ReadDirectoryChangesW`, `inotify`,
  `kqueue`/FSEvents); the dependency is compiled but idle until a file is
  open.
- Events are delivered from a background thread and emitted with
  `AppHandle::emit`, so no command runs on the main thread.
- A change made and reverted within the debounce window produces one event
  whose re-read yields identical text; the session treats it as a no-op.
