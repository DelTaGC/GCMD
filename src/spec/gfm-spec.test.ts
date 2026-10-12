/**
 * GFM spec harness.
 *
 * Renders every spec example through the Lezer tree (render.ts), normalises
 * both sides (normalize.ts) and reports pass/total per section. It does not
 * gate on 100 %; it enforces PASS_FLOOR so regressions are caught, and phase 5
 * makes the expected subset gating. See docs/decisions/0003-parser.md.
 */
import { describe, expect, it } from "vitest";
import spec from "../../tests/fixtures/gfm/spec.json";
import { normalizeHtml } from "./normalize";
import { renderToHtml } from "./render";

/**
 * Number of examples that must pass. Raise this when the renderer improves;
 * a change that lowers the count must say so in the commit message.
 */
const PASS_FLOOR = 651;

interface SpecExample {
  markdown: string;
  html: string;
  example: number;
  start_line: number;
  end_line: number;
  section: string;
  extension: string;
}

const examples: SpecExample[] = spec;

describe("GFM spec fixture", () => {
  it("contains the 672 examples of GFM spec 0.29", () => {
    expect(examples).toHaveLength(672);
  });

  it("numbers examples consecutively from 1", () => {
    examples.forEach((ex, i) => {
      expect(ex.example).toBe(i + 1);
    });
  });

  it("includes every GFM extension GCMD supports", () => {
    const extensions = new Set(examples.map((ex) => ex.extension));
    expect(extensions.has("table")).toBe(true);
    expect(extensions.has("strikethrough")).toBe(true);
    expect(extensions.has("autolink")).toBe(true);
    // Task list items are in section "Task list items (extension)" without a marker.
    expect(examples.some((ex) => ex.section.startsWith("Task list items"))).toBe(true);
  });

  it("converted visible tab markers back to real tabs", () => {
    expect(examples.some((ex) => ex.markdown.includes("→"))).toBe(false);
    expect(examples.some((ex) => ex.markdown.includes("\t"))).toBe(true);
  });
});

interface SectionTally {
  passed: number;
  total: number;
}

function passes(ex: SpecExample): boolean {
  try {
    const actual = renderToHtml(ex.markdown, { tagfilter: ex.extension === "tagfilter" });
    return normalizeHtml(actual) === normalizeHtml(ex.html);
  } catch {
    return false;
  }
}

function formatReport(passed: number, bySection: Map<string, SectionTally>): string {
  const width = Math.max(...[...bySection.keys()].map((name) => name.length));
  const lines = [`GFM spec (Lezer): ${String(passed)}/${String(examples.length)} examples pass`];
  for (const [name, tally] of bySection) {
    const pct = Math.round((tally.passed / tally.total) * 100);
    lines.push(
      `  ${name.padEnd(width)}  ${String(tally.passed).padStart(3)}/${String(tally.total).padEnd(3)} ${String(pct).padStart(3)}%`,
    );
  }
  return lines.join("\n");
}

describe("GFM spec harness", () => {
  it("renders the examples through Lezer and meets the pass floor", () => {
    const bySection = new Map<string, SectionTally>();
    let passed = 0;
    for (const ex of examples) {
      const tally = bySection.get(ex.section) ?? { passed: 0, total: 0 };
      tally.total++;
      if (passes(ex)) {
        tally.passed++;
        passed++;
      }
      bySection.set(ex.section, tally);
    }
    // eslint-disable-next-line no-console
    console.info(formatReport(passed, bySection));
    expect(passed).toBeGreaterThanOrEqual(PASS_FLOOR);
  });
});
