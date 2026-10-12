/**
 * DOM-free port of the CommonMark spec-test HTML normalizer. Both the
 * expected and the rendered HTML go through it before comparison, so only
 * structural differences remain.
 */
import { decodeEntities } from "./entities";

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ul",
  "ol",
  "pre",
  "blockquote",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
]);

const VOID_TAGS: ReadonlySet<string> = new Set(["br", "hr", "img", "input"]);

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Za-z][^>]*>|<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|[^<]+|</g;

const ATTRIBUTE = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

type Token =
  | { kind: "text"; value: string }
  | { kind: "raw"; value: string }
  | { kind: "tag"; value: string; name: string; closing: boolean };

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

function canonicalTag(
  name: string,
  closing: boolean,
  attributeSource: string,
  selfClosing: boolean,
): string {
  if (closing) return `</${name}>`;
  const attributes: [string, string][] = [];
  for (const m of attributeSource.matchAll(ATTRIBUTE)) {
    const key = (m[1] ?? "").toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    attributes.push([key, escapeAttribute(decodeEntities(value))]);
  }
  attributes.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const rendered = attributes.map(([k, v]) => ` ${k}="${v}"`).join("");
  return VOID_TAGS.has(name) || selfClosing ? `<${name}${rendered} />` : `<${name}${rendered}>`;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  for (const m of html.matchAll(TOKEN)) {
    const whole = m[0];
    const name = m[2];
    if (name !== undefined) {
      const lower = name.toLowerCase();
      const closing = m[1] === "/";
      tokens.push({
        kind: "tag",
        value: canonicalTag(lower, closing, m[3] ?? "", m[4] === "/"),
        name: lower,
        closing,
      });
    } else if (whole.startsWith("<") && whole.length > 1) {
      tokens.push({ kind: "raw", value: whole });
    } else {
      const last = tokens[tokens.length - 1];
      if (last?.kind === "text") last.value += whole;
      else tokens.push({ kind: "text", value: whole });
    }
  }
  return tokens;
}

function isBlockBoundary(token: Token | undefined): boolean {
  return token === undefined || (token.kind === "tag" && BLOCK_TAGS.has(token.name));
}

export function normalizeHtml(html: string): string {
  const tokens = tokenize(html);
  let preDepth = 0;
  let out = "";
  tokens.forEach((token, i) => {
    if (token.kind === "tag") {
      if (token.name === "pre") preDepth += token.closing ? -1 : 1;
      out += token.value;
      return;
    }
    if (token.kind === "raw") {
      out += token.value;
      return;
    }
    let text = escapeText(decodeEntities(token.value));
    if (preDepth <= 0) {
      text = text.replace(/[ \t\n\r\f]+/g, " ");
      if (isBlockBoundary(tokens[i - 1])) text = text.replace(/^ /, "");
      if (isBlockBoundary(tokens[i + 1])) text = text.replace(/ $/, "");
    }
    out += text;
  });
  return out.trim();
}
