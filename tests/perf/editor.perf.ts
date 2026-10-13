/**
 * DOM-free editor timings over the generated fixtures (`npm run
 * fixtures:large` for the 1 MB document, `npm run fixtures:large -- --mb 0.55
 * --out 20k-lines.md` for the 20k-line one). Run with `npm run bench`
 * (vitest with vitest.bench.config.ts, verbose reporter); results and the
 * budgets they feed are recorded in docs/perf.md. Everything here happens
 * before the browser paints: parsing, state creation, the live-preview state
 * fields, the outline, and one keystroke on a fully parsed state. The limits
 * asserted below are loose regression guards (several times the measured
 * values), not the budgets.
 */
import { existsSync, readFileSync } from "node:fs";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { afterAll, describe, expect, it } from "vitest";
import { createEditorState, markdownExtension } from "../../src/editor/create";
import { buildOutline, collectHeadings } from "../../src/editor/outline";

interface Fixture {
  name: string;
  text: string;
}

function loadFixture(name: string): Fixture {
  const url = new URL(`../fixtures/generated/${name}`, import.meta.url);
  return { name, text: existsSync(url) ? readFileSync(url, "utf8") : "" };
}

const fixtures = [loadFixture("large.md"), loadFixture("20k-lines.md")];

interface Timing {
  name: string;
  runs: number;
  min: number;
  median: number;
  mean: number;
}

const timings: Timing[] = [];

/** Runs `fn` after one warm-up, `runs` times, and records min/median/mean in ms. */
function measure(name: string, runs: number, fn: () => void): Timing {
  fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const timing: Timing = {
    name,
    runs,
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
  timings.push(timing);
  return timing;
}

function formatTable(rows: readonly Timing[]): string {
  const width = Math.max(...rows.map((r) => r.name.length));
  const ms = (n: number): string => n.toFixed(1).padStart(8);
  const lines = [
    `${"case".padEnd(width)}  ${"runs".padStart(4)}  ${"min ms".padStart(8)}  ${"median".padStart(8)}  ${"mean".padStart(8)}`,
  ];
  for (const r of rows) {
    lines.push(
      `${r.name.padEnd(width)}  ${String(r.runs).padStart(4)}  ${ms(r.min)}  ${ms(r.median)}  ${ms(r.mean)}`,
    );
  }
  return lines.join("\n");
}

/** A state whose whole syntax tree is available, like after idle parsing. */
function fullyParsed(doc: string, cursor: number): EditorState {
  const state = createEditorState(doc, false, [], null);
  ensureSyntaxTree(state, doc.length, 60_000);
  return state.update({ selection: EditorSelection.cursor(cursor) }).state;
}

afterAll(() => {
  if (timings.length > 0) {
    // Bypasses vitest's console capture so the table always shows.
    process.stdout.write(`\n${formatTable(timings)}\n\n`);
  }
});

describe.each(fixtures)("$name", ({ name, text }) => {
  const lines = text.split("\n").length;
  const label = `${name} (${String(Math.round(text.length / 1024))} KB, ${String(lines)} lines)`;

  describe.skipIf(text.length === 0)(label, () => {
    it("parses the whole document with Lezer", () => {
      const t = measure(`${name}: full Lezer parse`, 5, () => {
        markdownLanguage.parser.parse(text);
      });
      expect(t.median).toBeLessThan(3000);
    });

    it("creates a bare language state (what opening a file does first)", () => {
      const t = measure(`${name}: bare language state`, 5, () => {
        EditorState.create({ doc: text, extensions: [markdownExtension()] });
      });
      expect(t.median).toBeLessThan(1000);
    });

    it("creates the full editor state (all extensions, no view)", () => {
      const t = measure(`${name}: full editor state`, 5, () => {
        createEditorState(text, false, [], null);
      });
      expect(t.median).toBeLessThan(1000);
    });

    it("collects the outline from a parsed tree", () => {
      const parsed = fullyParsed(text, 0);
      const t = measure(`${name}: outline`, 10, () => {
        buildOutline(collectHeadings(parsed));
      });
      expect(t.median).toBeLessThan(200);
    });

    it("types one character at the end of a fully parsed state", () => {
      const parsed = fullyParsed(text, text.length);
      const t = measure(`${name}: keystroke at end`, 20, () => {
        const next = parsed.update({
          changes: { from: text.length, insert: "a" },
          selection: EditorSelection.cursor(text.length + 1),
        }).state;
        syntaxTree(next);
      });
      expect(t.median).toBeLessThan(100);
    });

    it("types one character in the middle of a fully parsed state", () => {
      const middle = Math.floor(text.length / 2);
      const parsed = fullyParsed(text, middle);
      const t = measure(`${name}: keystroke in the middle`, 20, () => {
        const next = parsed.update({
          changes: { from: middle, insert: "a" },
          selection: EditorSelection.cursor(middle + 1),
        }).state;
        syntaxTree(next);
      });
      expect(t.median).toBeLessThan(100);
    });

    it("moves the cursor (selection-only transaction)", () => {
      const parsed = fullyParsed(text, text.length);
      const t = measure(`${name}: cursor move`, 50, () => {
        parsed.update({ selection: EditorSelection.cursor(text.length - 100) });
      });
      expect(t.median).toBeLessThan(20);
    });
  });
});
