/**
 * Hanging indent for list items: wrapped rows and continuation source lines
 * start in the column of the item's first character.
 *
 * The editor font is proportional, so that column is measured: the text in
 * front of the content, as it is displayed (bullet glyph or raw marker,
 * checkbox, quote markers), is sized with a canvas and cached. The line gets
 * the width as `--hang` (padding plus a negative text indent in
 * `theme/editor.css`), and the characters in front of the content are boxed
 * to that same width, so the first row and the wrapped rows line up exactly.
 */
import { Facet, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { isActive } from "./activeBlock";
import { livePreviewFamily, refreshLivePreview, type NodeVisitor } from "./decorate";
import { bulletGlyph } from "./lists";

/** How a stretch of prefix text is drawn, which decides its width. */
export type PrefixStyle = "text" | "mark" | "mono-mark";

/** The width of `text` drawn in `style`, in `em` of the editor text size. */
export type MeasureText = (text: string, style: PrefixStyle) => number;

/** A width that scales with the text (`em`) plus a part that does not (`px`). */
export interface Width {
  readonly em: number;
  readonly px: number;
}

/** The task checkbox and its margin, as sized in `theme/editor.css`. */
const CHECKBOX_PX = 19;

const widths = new Map<string, number>();
let fonts: { text: string; mono: string } | null = null;
let context: CanvasRenderingContext2D | null | undefined;

function rootFont(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

const measureOnCanvas: MeasureText = (text, style) => {
  // Without a DOM (unit tests, benchmarks) a rough average is enough.
  if (typeof document === "undefined") {
    return text.length * 0.5;
  }
  const key = `${style}:${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) {
    return cached;
  }
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) {
    return text.length * 0.5;
  }
  fonts ??= {
    text: rootFont("--font-editor", "sans-serif"),
    mono: rootFont("--font-mono", "monospace"),
  };
  const family = style === "mono-mark" ? fonts.mono : fonts.text;
  context.font = `${style === "text" ? "400" : "800"} 100px ${family}`;
  const width = context.measureText(text).width / 100;
  widths.set(key, width);
  return width;
};

/** Replaceable so tests get predictable widths. */
export const textMeasure = Facet.define<MeasureText, MeasureText>({
  combine: (values) => values[0] ?? measureOnCanvas,
});

/** Measures again after the editor fonts may have changed. */
export function refreshListIndent(view: EditorView): void {
  widths.clear();
  fonts = null;
  view.dispatch({ effects: refreshLivePreview.of(null) });
}

/** Quote markers, list markers and a task box in front of an item's text. */
const ITEM_PREFIX = /^(?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)+(?:\[[ xX]\](?:[ \t]+|$))?/;
/** What may precede the text of a continuation line. */
const CONTINUATION_PREFIX = /^[ \t>]*/;
const TOKEN = /[ \t]+|>|\[[ xX]\]|\d+[.)]|./g;

/**
 * The displayed width of `prefix`, following what the lists and blockquote
 * families do to it on an active or inactive line.
 */
export function prefixWidth(
  prefix: string,
  active: boolean,
  glyph: string,
  measure: MeasureText,
): Width {
  const tokens = prefix.match(TOKEN) ?? [];
  const space = measure(" ", "text");
  let em = 0;
  let px = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const next = tokens[i + 1] ?? "";
    if (token.startsWith(" ") || token.startsWith("\t")) {
      for (const char of token) {
        // Tab stops every four spaces, counted from the start of the line.
        em = char === "\t" ? (Math.floor(em / (4 * space) + 0.01) + 1) * 4 * space : em + space;
      }
    } else if (token === ">") {
      if (active) {
        em += measure(token, "mark");
      } else if (next.startsWith(" ")) {
        tokens[i + 1] = next.slice(1);
      }
    } else if (token.startsWith("[") && token.length === 3) {
      if (active) {
        em += measure(token, "mono-mark");
      } else {
        px += CHECKBOX_PX;
        if (next.startsWith(" ")) {
          tokens[i + 1] = next.slice(1);
        }
      }
    } else if (active) {
      em += measure(token, "mark");
    } else if (next === " " && /^\[[ xX]\]$/.test(tokens[i + 2] ?? "")) {
      // The checkbox stands in for the marker and its space.
      i++;
    } else {
      em += measure(/^[-*+]$/.test(token) ? glyph : token, "text");
    }
  }
  return { em, px };
}

function css(width: Width): string {
  return `calc(${width.em.toFixed(4)}em + ${String(width.px)}px)`;
}

/** The list item whose own text `node` is, or `null`. */
function owningItem(node: SyntaxNode): SyntaxNode | null {
  return node.parent?.name === "ListItem" ? node.parent : null;
}

function itemHang(state: EditorState, item: SyntaxNode): Width | null {
  const line = state.doc.lineAt(item.from);
  const prefix = ITEM_PREFIX.exec(line.text)?.[0];
  if (prefix === undefined || !item.parent) {
    return null;
  }
  const active = isActive(state, line.from, line.to);
  return prefixWidth(prefix, active, bulletGlyph(item.parent), state.facet(textMeasure));
}

export const visitListIndent: NodeVisitor = (ref, state, out) => {
  if (ref.name !== "Paragraph" && ref.name !== "Task") {
    return undefined;
  }
  const node = ref.node;
  const item = owningItem(node);
  const hang = item ? itemHang(state, item) : null;
  if (!item || !hang) {
    return undefined;
  }
  const value = css(hang);
  const markLine = state.doc.lineAt(item.from).number;
  const last = state.doc.lineAt(node.to).number;
  for (let number = state.doc.lineAt(node.from).number; number <= last; number++) {
    const line = state.doc.line(number);
    const first = number === markLine;
    const prefix = (first ? ITEM_PREFIX : CONTINUATION_PREFIX).exec(line.text)?.[0] ?? "";
    // A lazy line has nothing in front of its text: it is only indented.
    out.line(line.from, prefix === "" ? "cm-list-lazy" : "cm-list-hang", {
      style: `--hang: ${value}`,
    });
    if (prefix !== "") {
      // The first row keeps its natural width if it measures a hair wider;
      // leading spaces of a continuation line are forced into the column.
      // A task box or quote marker at the end is replaced when inactive.
      out.box(
        line.from,
        line.from + prefix.length,
        "cm-list-prefix",
        { style: `${first ? "min-width" : "width"}: ${value}` },
        /[\]>][ \t]*$/.test(prefix),
      );
    }
  }
  return undefined;
};

export const listIndent = livePreviewFamily(visitListIndent);
