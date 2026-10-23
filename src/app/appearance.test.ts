import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../ipc/settings";
import { COLOR_KEYS, DEFAULT_COLORS, appearanceCss, cleanFont } from "./appearance";

describe("appearanceCss", () => {
  it("sets sizes and leaves default fonts and colors alone", () => {
    const css = appearanceCss(DEFAULT_APPEARANCE);
    expect(css).not.toContain("--editor-font-size");
    expect(css).toContain("--code-font-size: 0.9em;");
    expect(css).toContain("--editor-line-height: 1.6;");
    expect(css).not.toContain("--font-editor");
    expect(css).not.toContain("--bg");
  });

  it("writes fonts and valid color overrides per theme", () => {
    const css = appearanceCss({
      ...DEFAULT_APPEARANCE,
      textFont: "Georgia, serif",
      lightColors: { bg: "#FFFFF0", fg: "red" },
      darkColors: { link: "#88aaff" },
    });
    expect(css).toContain("--font-editor: Georgia, serif;");
    expect(css).toMatch(/:not\(\[data-theme="dark"\]\) \{\n {2}--bg: #fffff0;\n\}/);
    expect(css).not.toContain("red");
    expect(css).toMatch(/\[data-theme="dark"\] \{\n {2}--link: #88aaff;\n\}/);
  });

  it("strips characters that would escape the CSS value", () => {
    expect(cleanFont("Evil; } body { x")).toBe("Evil  body  x");
  });
});

describe("DEFAULT_COLORS", () => {
  // The panel shows these as the default colors, so they must match styles.css.
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const block = (selector: RegExp): string => selector.exec(css)?.[1] ?? "";
  const light = block(/:root \{([^}]*)\}/);
  const dark = block(/:root\[data-theme="dark"\] \{([^}]*)\}/);

  it("mirror the variables in styles.css", () => {
    for (const { key } of COLOR_KEYS) {
      expect(light, `light --${key}`).toContain(`--${key}: ${DEFAULT_COLORS.light[key] ?? ""};`);
      expect(dark, `dark --${key}`).toContain(`--${key}: ${DEFAULT_COLORS.dark[key] ?? ""};`);
    }
  });
});
