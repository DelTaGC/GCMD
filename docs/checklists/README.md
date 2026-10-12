# Manual verification checklists

Logic is unit-tested; UI behavior is verified by walking these lists in the
running app (`npm run app:dev`) with `tests/fixtures/sample.md` open, in both
the light and the dark theme. Each phase adds a file; keep old ones passing.

| File                                           | Covers                               |
| ---------------------------------------------- | ------------------------------------ |
| [phase-1-foundation.md](phase-1-foundation.md) | Window opens, tooling and hooks work |
