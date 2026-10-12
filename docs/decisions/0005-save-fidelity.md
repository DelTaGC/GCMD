# 0005: Byte-faithful save, explicit save only

Date: 2026-10-12. Status: Accepted.

## Context

Zettlr sometimes rewrote whitespace, list markers, or line endings on save.
The user wants `git diff` after an edit to show only the lines they changed.
They also prefer explicit saving over autosave.

## Decision

- Files are read as bytes. The backend detects BOM, encoding (UTF-8 expected;
  anything else is reported as an error rather than silently converted), the
  dominant line ending, and whether the file ends with a newline. That
  metadata travels with the document.
- The editor buffer holds LF internally. On save the backend re-applies the
  original line ending, BOM, and trailing-newline state.
- Saving happens only on Ctrl+S / Save menu. A dirty marker is shown in the
  title and a prompt appears on close with unsaved changes.
- No formatter runs on save. Formatting operations (for example table pipe
  alignment when leaving a table) are explicit, undoable buffer edits.
- If the file changes on disk: reload silently when the buffer is clean,
  show a Reload / Keep banner when it is dirty.

## Consequences

- Mixed line endings in one file are normalized to the dominant one on
  save; this is the one accepted deviation and is covered by a test.
- Non-UTF-8 files open read-only with an explanatory banner until an
  encoding picker exists.
