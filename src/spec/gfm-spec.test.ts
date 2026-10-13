/**
 * GFM spec harness.
 *
 * Renders every spec example through the Lezer tree (render.ts), normalises
 * both sides (normalize.ts) and reports pass/total per section. It gates:
 * every example must pass unless it is listed in KNOWN_FAILURES, and every
 * listed example must still fail, so a fix (ours or upstream) is noticed and
 * the list shrinks. Each entry is explained in docs/known-deviations.md.
 * See docs/decisions/0003-markdown-parser.md.
 */
import { describe, expect, it } from "vitest";
import spec from "../../tests/fixtures/gfm/spec.json";
import { normalizeHtml } from "./normalize";
import { renderToHtml } from "./render";

/**
 * Examples Lezer is not expected to pass, by number, with the reason in a
 * few words. Keep docs/known-deviations.md in step with this list.
 */
export const KNOWN_FAILURES: ReadonlyMap<number, string> = new Map([
  [5, "tab partially consumed by a container prefix is not kept as spaces"],
  [6, "tab partially consumed by a container prefix is not kept as spaces"],
  [7, "tab partially consumed by a container prefix is not kept as spaces"],
  [10, "a tab after the # of an ATX heading is not accepted"],
  [82, "whitespace-only line inside indented code loses its spaces"],
  [237, "'>>' without a space before a list item: lazy continuation instead of a new paragraph"],
  [258, "an empty list item swallows the paragraph after the blank line"],
  [502, "'<foo\\>' is accepted as a link destination"],
  [520, "two levels of nested brackets in link text are not parsed"],
  [531, "emphasis is not allowed to cross an unmatched '['"],
  [536, "two levels of nested brackets in link text are not parsed"],
  [577, "'[foo][bar][baz]' pairs the brackets left to right without knowing the definitions"],
  [579, "'[foo][bar][baz]' pairs the brackets left to right without knowing the definitions"],
  [610, "a bare URL right after '<' is autolinked"],
  [616, "bare URL autolinked: the extended autolink extension is always on"],
  [619, "bare URL autolinked: the extended autolink extension is always on"],
  [620, "bare e-mail autolinked: the extended autolink extension is always on"],
  [628, "ftp:// is not an extended autolink scheme"],
  [644, "'--' inside an HTML comment is accepted by the spec but not by Lezer"],
  [645, "'<!-->' is a comment in the spec, not in Lezer"],
]);

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

function describeExample(ex: SpecExample): string {
  return `#${String(ex.example)} [${ex.section}] ${JSON.stringify(ex.markdown)}`;
}

describe("GFM spec harness", () => {
  const results = new Map(examples.map((ex) => [ex.example, passes(ex)]));

  it("reports the pass count per section", () => {
    const bySection = new Map<string, SectionTally>();
    let passed = 0;
    for (const ex of examples) {
      const tally = bySection.get(ex.section) ?? { passed: 0, total: 0 };
      tally.total++;
      if (results.get(ex.example) === true) {
        tally.passed++;
        passed++;
      }
      bySection.set(ex.section, tally);
    }
    // eslint-disable-next-line no-console
    console.info(formatReport(passed, bySection));
    expect(passed).toBe(examples.length - KNOWN_FAILURES.size);
  });

  it("passes every example that is not a known deviation", () => {
    const unexpected = examples
      .filter((ex) => results.get(ex.example) !== true && !KNOWN_FAILURES.has(ex.example))
      .map(describeExample);
    expect(unexpected).toEqual([]);
  });

  it("still fails every listed known deviation (prune the list when one is fixed)", () => {
    const fixed = examples
      .filter((ex) => results.get(ex.example) === true && KNOWN_FAILURES.has(ex.example))
      .map(describeExample);
    expect(fixed).toEqual([]);
  });

  it("lists only existing example numbers", () => {
    for (const n of KNOWN_FAILURES.keys()) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(examples.length);
    }
  });
});
