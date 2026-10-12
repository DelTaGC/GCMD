/**
 * GFM spec harness.
 *
 * Phase 1: validates the fixture only. Phase 2 adds a Lezer-based runner
 * that reports pass/fail counts per section; phase 5 makes the expected
 * subset gating. See docs/decisions/0003-parser.md.
 */
import { describe, expect, it } from "vitest";
import spec from "../../tests/fixtures/gfm/spec.json";

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
