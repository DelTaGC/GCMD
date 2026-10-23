/**
 * Applies the appearance settings (fonts, code size, line height, color
 * overrides) as CSS
 * custom properties in one `<style>` element; `src/styles.css` holds the
 * defaults. The text size is not here: View > Zoom sets it on the editor
 * (`editor/zoom.ts`). The style text is a pure function so it is unit-tested.
 */
import type { AppearanceSettings } from "../ipc/settings";

export type ColorTheme = "light" | "dark";

/** The colors the settings panel offers, by CSS variable name without dashes. */
export const COLOR_KEYS = [
  { key: "bg", label: "Background" },
  { key: "fg", label: "Text" },
  { key: "heading", label: "Headings" },
  { key: "link", label: "Links" },
  { key: "markup", label: "Markup" },
  { key: "code-bg", label: "Code background" },
  { key: "quote-border", label: "Quote bar" },
  { key: "selection", label: "Selection" },
] as const;

/** The built-in values of `COLOR_KEYS` (mirrors `src/styles.css`, checked by a test). */
export const DEFAULT_COLORS: Readonly<Record<ColorTheme, Readonly<Record<string, string>>>> = {
  light: {
    bg: "#ffffff",
    fg: "#1f2328",
    heading: "#1f2328",
    link: "#0969da",
    markup: "#b3261e",
    "code-bg": "#f3f5f7",
    "quote-border": "#d0d7de",
    selection: "#b4d7ff",
  },
  dark: {
    bg: "#0d1117",
    fg: "#e6edf3",
    heading: "#f0f6fc",
    link: "#4493f8",
    markup: "#f28b82",
    "code-bg": "#161b22",
    "quote-border": "#3d444d",
    selection: "#264f78",
  },
};

const HEX = /^#[0-9a-f]{6}$/i;
const KEY = /^[a-z0-9-]+$/;

/** Removes what could end a CSS value or rule; Rust sanitizes the same way. */
export function cleanFont(name: string): string {
  return name.replace(/[;{}<>\\]/g, "").trim();
}

function colorRules(colors: Readonly<Record<string, string>>): string {
  return Object.entries(colors)
    .filter(([key, value]) => KEY.test(key) && HEX.test(value))
    .map(([key, value]) => `  --${key}: ${value.toLowerCase()};\n`)
    .join("");
}

/** The style sheet text for `appearance`; empty fields leave the defaults. */
export function appearanceCss(appearance: AppearanceSettings): string {
  const root: string[] = [
    `  --code-font-size: ${String(appearance.codeFontScale / 100)}em;\n`,
    `  --editor-line-height: ${String(appearance.lineHeight / 100)};\n`,
  ];
  const text = cleanFont(appearance.textFont);
  if (text !== "") {
    root.push(`  --font-editor: ${text};\n`);
  }
  const code = cleanFont(appearance.codeFont);
  if (code !== "") {
    root.push(`  --font-mono: ${code};\n`);
  }
  // `:root:root[...]` outranks the theme blocks in styles.css.
  return [
    `:root {\n${root.join("")}}\n`,
    `:root:root:not([data-theme="dark"]) {\n${colorRules(appearance.lightColors)}}\n`,
    `:root:root[data-theme="dark"] {\n${colorRules(appearance.darkColors)}}\n`,
  ].join("");
}

let styleElement: HTMLStyleElement | null = null;

/** Installs or replaces the appearance style sheet. */
export function applyAppearance(appearance: AppearanceSettings): void {
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "gcmd-appearance";
    document.head.append(styleElement);
  }
  styleElement.textContent = appearanceCss(appearance);
}
