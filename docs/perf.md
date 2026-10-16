# Performance budgets and measurements

Budgets come from CLAUDE.md invariant 5. This file records how each one is
measured and the last numbers, so a regression is a diff against a known
baseline rather than a feeling. Re-measure after changes to the parser,
the live-preview families, the bundle composition, or the Tauri version.

Machine for the numbers below: the development PC (Windows 11, 24 threads,
WebView2 of Windows 11), 2026-10-13, commit of phase 5, release build
(`npx tauri build --no-bundle`). Fixtures: `npm run fixtures:large` (1 MB,
37 053 lines, 1 118 TypeScript fences) and
`npm run fixtures:large -- --mb 0.55 --out 20k-lines.md` (0.55 MB, 20 417
lines).

## Summary

| Budget (CLAUDE.md)                                 | Measured                                                    | Status    |
| -------------------------------------------------- | ----------------------------------------------------------- | --------- |
| Cold start to editable under 1 s                   | 300 ms warm, 580 ms first launch after a build (sample.md)  | Met       |
| 1 MB document opens under 500 ms                   | 330 ms from process start to document loaded (large.md)     | Met       |
| Typing latency under 16 ms at the end of 20k lines | 9 ms median, 15 ms p90 per keystroke (20k-lines.md)         | Met       |
| Startup bundle under 1 MB gzip                     | entry chunk 371 kB, 131 kB gzip; mermaid and languages lazy | Met       |
| Memory after 10 minutes of editing                 | JS heap back to 29 MB after 6 000 edits (33 MB before)      | No growth |

The 1 MB fixture is outside the typing budget: 22 ms median per keystroke
at its end. See "Known cost" below.

## How each number is measured

### Cold start and open time (Tauri, release build)

A PowerShell loop starts `gcmd.exe <file>` and polls the process's main
window title every 5 ms until it contains the file name. The session sets
the title after the document is in the editor, so this is "process start
to document loaded", slightly before the first paint. Five runs each:

| File             | ms to title (runs)      | GCMD process working set | Process group (7 processes with WebView2) |
| ---------------- | ----------------------- | ------------------------ | ----------------------------------------- |
| sample.md (8 KB) | 579, 298, 298, 310, 300 | 29 to 34 MB              | 370 MB working set                        |
| large.md (1 MB)  | 360, 331, 327, 327, 330 | 29 MB                    | 387 MB working set                        |

The process group number sums the working sets of the WebView2 browser,
GPU, renderer and utility processes; shared pages are counted once per
process, so it overstates real use. The main process stays under 35 MB.

Script: `tools/perf/coldstart.ps1`, run as
`powershell -File tools/perf/coldstart.ps1 <exe> <file> [runs]`.

### Typing latency and open time in the editor (browser, dev build)

`npm run dev` serves the frontend at http://localhost:1420; the dev build
exposes `window.gcmd` with `view` and `replaceDocument`. The fixture is
fetched from `/tests/fixtures/generated/<name>` and loaded with
`gcmd.replaceDocument(gcmd.view, text, false, null)`. After three seconds
for the idle parse, the cursor is put at the end and 25 single-character
insertions are dispatched 30 ms apart, timing `view.dispatch` (state update
plus DOM update) and a forced layout after it. Chromium (the Claude in-app
browser), not WebView2, but both are Chromium engines.

| Fixture      | setState + first DOM update | dispatch median | with layout | p90   | max   |
| ------------ | --------------------------- | --------------- | ----------- | ----- | ----- |
| 20k-lines.md | 3 to 5 ms                   | 8.9 ms          | 9.5 ms      | 15 ms | 55 ms |
| large.md     | 7 to 26 ms                  | 22.4 ms         | 22.7 ms     | 31 ms | 79 ms |

The max values are single outliers (an idle parse slice or a garbage
collection landing on the same frame).

### DOM-free timings (`npm run bench`)

`tests/perf/editor.perf.ts` measures the parts that run before the browser
paints: full Lezer parse, state creation, outline, and one keystroke on a
fully parsed state (incremental parse plus the live-preview state fields).
Loose limits in the file guard against order-of-magnitude regressions; the
table it prints is the baseline:

| Case                        | large.md (median) | 20k-lines.md (median) |
| --------------------------- | ----------------- | --------------------- |
| full Lezer parse            | 82 ms             | 42 ms                 |
| bare language state         | 2 ms              | 1 ms                  |
| full editor state (no view) | 2 ms              | 1 ms                  |
| outline                     | 7 ms              | 3 ms                  |
| keystroke at end            | 15 ms             | 6 ms                  |
| keystroke in the middle     | 15 ms             | 6 ms                  |
| cursor move                 | 0 ms              | 0 ms                  |

### Memory after sustained editing

In the browser setup above, 6 000 single-character transactions were
dispatched at the end of 20k-lines.md (a line deleted every 200 characters
so the document does not grow), ten at a time with 50 ms pauses: 105 s of
wall time, roughly ten minutes of typing at 10 keys per second. JS heap
(`performance.memory.usedJSHeapSize`): 33 MB before, 76 MB right after the
loop (garbage not yet collected), 29 MB a few seconds later. No growth.
In that stress loop 15 % of the dispatches took over 16 ms (max 87 ms),
because ten keystrokes are issued back to back while the idle parser and
the debounced outline also run; the paced measurement above is the one the
budget refers to.

### Bundle size

`npm run build` prints the chunk sizes. The entry chunk
(`dist/assets/index-*.js`) must stay under 1 MB gzip: 335 kB raw, 119 kB
gzip at phase 5, 345 kB / 123 kB before link completion, 371 kB / 131 kB
with it (2026-10-16, ADR 0013). Mermaid (`mermaid.core-*`, 85 kB raw core
plus diagram chunks) and every fence language load on demand.

## Known cost: fences and mixed parsing

Each keystroke re-runs CodeMirror's incremental parse for up to 20 ms
(`Work.Apply`). With `@lezer/markdown` alone that is 4 ms on the 1 MB
fixture, but `parseMixed` visits every fenced code block to set up its
nested parse again, about 12 µs per fence: 1 118 fences add 13 ms, which is
why the 1 MB fixture misses the 16 ms budget while the 20k-line one meets
it. Documents with a few dozen fences are unaffected. If this ever matters,
the fix is to stop routing fence languages through `parseMixed` and
highlight visible fences from a per-fence cached parse in `codeFence.ts`.

## Re-measuring

1. `npm run fixtures:large` and `npm run fixtures:large -- --mb 0.55 --out 20k-lines.md`.
2. `npm run bench` for the DOM-free table.
3. `npm run dev`, open http://localhost:1420 in a browser, run the snippets
   described above from the console (`window.gcmd`).
4. `npx tauri build --no-bundle`, then `tools/perf/coldstart.ps1` for cold
   start and memory.
5. Update the tables here and the date at the top.
