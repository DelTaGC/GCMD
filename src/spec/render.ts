/**
 * Minimal Lezer-tree to HTML renderer used by the GFM spec harness.
 *
 * It mirrors the CommonMark/GFM reference output closely enough for the
 * normalised comparison in gfm-spec.test.ts, so the pass count measures how
 * faithfully the editor's parser (the Lezer markdown tree) models the spec.
 * It is a test tool, never shipped in the app bundle.
 */
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { SyntaxNode } from "@lezer/common";
import { decodeReference } from "./entities";

export interface RenderOptions {
  /** GFM "Disallowed Raw HTML" extension: escape `<` of unsafe raw tags. */
  tagfilter?: boolean;
}

interface RefDef {
  url: string;
  title: string | null;
}

interface Ctx {
  src: string;
  refs: Map<string, RefDef>;
  tagfilter: boolean;
  inTable: boolean;
}

/** Inline rendering state: whether the next character starts a source line. */
interface Line {
  start: boolean;
}

type Mode = "html" | "plain";

// --------------------------------------------------------------------------
// String helpers

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BACKSLASH_OR_REFERENCE =
  /\\([!-/:-@[-`{-~])|&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/g;

/** Resolve backslash escapes and character references (link destinations, titles, info strings). */
function unescapeString(s: string): string {
  return s.replace(
    BACKSLASH_OR_REFERENCE,
    (whole, punct?: string, hex?: string, dec?: string, name?: string) =>
      punct ?? decodeReference(whole, hex, dec, name),
  );
}

const HREF_SAFE = /[A-Za-z0-9\-_.+!*'(),%#@?=;:/&$~]/;

/** Percent-encode like cmark's href escaper (keeps existing `%XX`, `%` is always safe). */
function encodeUrl(url: string): string {
  let out = "";
  for (const ch of url) {
    if (HREF_SAFE.test(ch)) {
      out += ch;
    } else {
      out += Array.from(
        new TextEncoder().encode(ch),
        (b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`,
      ).join("");
    }
  }
  return out;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase().toUpperCase();
}

const FILTERED_TAG =
  /<(?=\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?:[\s/>]|$))/gi;

function filterRaw(ctx: Ctx, raw: string): string {
  return ctx.tagfilter ? raw.replace(FILTERED_TAG, "&lt;") : raw;
}

// --------------------------------------------------------------------------
// Tree helpers

function kids(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
  return out;
}

function lastOf(nodes: SyntaxNode[]): SyntaxNode | undefined {
  return nodes[nodes.length - 1];
}

/** Source of a node range with the container markers (`>`) that Lezer nests inside it removed. */
function sourceWithoutMarks(ctx: Ctx, node: SyntaxNode, from: number, to: number): string {
  let out = "";
  let pos = from;
  for (const c of kids(node)) {
    if (c.name !== "QuoteMark" || c.from < from || c.to > to) continue;
    out += ctx.src.slice(pos, c.from);
    pos = c.to;
  }
  return out + ctx.src.slice(pos, to);
}

function trimEndPos(src: string, from: number, to: number): number {
  let end = to;
  while (end > from && (src[end - 1] === " " || src[end - 1] === "\t")) end--;
  return end;
}

// --------------------------------------------------------------------------
// Inline rendering

function renderText(ctx: Ctx, line: Line, from: number, to: number): string {
  const pieces = ctx.src.slice(from, to).split("\n");
  let out = "";
  pieces.forEach((piece, i) => {
    let seg = piece;
    if (line.start) seg = seg.replace(/^[ \t]+/, "");
    const last = i === pieces.length - 1;
    if (!last) seg = seg.replace(/[ \t]+$/, "");
    if (seg.length > 0) line.start = false;
    out += escapeHtml(seg);
    if (!last) {
      out += "\n";
      line.start = true;
    }
  });
  return out;
}

function renderInline(
  ctx: Ctx,
  line: Line,
  node: SyntaxNode,
  from: number,
  to: number,
  mode: Mode,
): string {
  let out = "";
  let pos = from;
  for (const c of kids(node)) {
    if (c.to <= from) continue;
    if (c.from >= to) break;
    if (c.from > pos) out += renderText(ctx, line, pos, c.from);
    out += renderInlineNode(ctx, line, c, mode);
    pos = Math.max(pos, c.to);
  }
  if (pos < to) out += renderText(ctx, line, pos, to);
  return out;
}

function wrapMarks(
  ctx: Ctx,
  line: Line,
  node: SyntaxNode,
  tag: string,
  markName: string,
  mode: Mode,
): string {
  const marks = kids(node).filter((c) => c.name === markName);
  const first = marks[0];
  const last = lastOf(marks);
  if (first === undefined || last === undefined || first === last) {
    return renderLiteral(ctx, line, node);
  }
  const inner = renderInline(ctx, line, node, first.to, last.from, mode);
  // Lezer nests `****x****` as strong(strong(x)); the spec output is a single element.
  // (Directly nested em is legitimate in the spec, e.g. `*(*foo*)*`.)
  const redundant = node.name === "StrongEmphasis" && node.parent?.name === node.name;
  return mode === "plain" || redundant ? inner : `<${tag}>${inner}</${tag}>`;
}

function renderLiteral(ctx: Ctx, line: Line, node: SyntaxNode): string {
  return renderText(ctx, line, node.from, node.to);
}

function renderCode(ctx: Ctx, line: Line, node: SyntaxNode): string {
  const marks = kids(node).filter((c) => c.name === "CodeMark");
  const first = marks[0];
  const last = lastOf(marks);
  if (first === undefined || last === undefined || first === last) {
    return renderLiteral(ctx, line, node);
  }
  let raw = sourceWithoutMarks(ctx, node, first.to, last.from);
  raw = raw.replace(/\n[ \t]+/g, "\n").replace(/\n/g, " ");
  if (ctx.inTable) raw = raw.replace(/\\\|/g, "|");
  if (raw.length > 2 && raw.startsWith(" ") && raw.endsWith(" ") && /[^ ]/.test(raw)) {
    raw = raw.slice(1, -1);
  }
  line.start = false;
  return `<code>${escapeHtml(raw)}</code>`;
}

function linkDestination(ctx: Ctx, node: SyntaxNode): string {
  let url = ctx.src.slice(node.from, node.to);
  if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
  return escapeHtml(encodeUrl(unescapeString(url)));
}

function linkTitle(ctx: Ctx, node: SyntaxNode | null): string | null {
  if (node === null) return null;
  return unescapeString(ctx.src.slice(node.from + 1, node.to - 1));
}

function renderLink(ctx: Ctx, line: Line, node: SyntaxNode, mode: Mode): string {
  const isImage = node.name === "Image";
  const marks = node.getChildren("LinkMark");
  const open = marks[0];
  const close = marks[1];
  if (open === undefined || close === undefined) return renderLiteral(ctx, line, node);

  let url: string | null = null;
  let title: string | null = null;
  const third = marks[2];
  if (third !== undefined && ctx.src[third.from] === "(") {
    const urlNode = node.getChild("URL");
    url = urlNode === null ? "" : linkDestination(ctx, urlNode);
    title = linkTitle(ctx, node.getChild("LinkTitle"));
  } else {
    const labelNode = node.getChild("LinkLabel");
    let label = ctx.src.slice(open.to, close.from);
    if (labelNode !== null && labelNode.to - labelNode.from > 2) {
      label = ctx.src.slice(labelNode.from + 1, labelNode.to - 1);
    }
    const def = ctx.refs.get(normalizeLabel(label));
    if (def !== undefined) {
      url = escapeHtml(encodeUrl(unescapeString(def.url)));
      title = def.title;
    }
  }

  if (url === null) {
    // No definition: the brackets are literal text.
    const inner = renderInline(ctx, line, node, open.to, close.from, mode);
    const tail = renderText(ctx, line, close.to, node.to);
    return `${escapeHtml(ctx.src.slice(open.from, open.to))}${inner}]${tail}`;
  }

  const inner = renderInline(ctx, line, node, open.to, close.from, isImage ? "plain" : mode);
  line.start = false;
  if (mode === "plain") return inner;
  const titleAttr = title === null ? "" : ` title="${escapeHtml(title)}"`;
  if (isImage) return `<img src="${url}" alt="${inner}"${titleAttr} />`;
  return `<a href="${url}"${titleAttr}>${inner}</a>`;
}

function renderAutolink(ctx: Ctx, line: Line, node: SyntaxNode, mode: Mode): string {
  const urlNode = node.getChild("URL") ?? node;
  const text = ctx.src.slice(urlNode.from, urlNode.to);
  line.start = false;
  let href = text;
  if (!/^[A-Za-z][A-Za-z0-9+.-]{1,31}:/.test(text)) {
    href = /^www\./i.test(text) && node.name === "URL" ? `http://${text}` : `mailto:${text}`;
  } else if (node.name === "URL" && /^www\./i.test(text)) {
    href = `http://${text}`;
  }
  if (mode === "plain") return escapeHtml(text);
  return `<a href="${escapeHtml(encodeUrl(href))}">${escapeHtml(text)}</a>`;
}

function renderInlineNode(ctx: Ctx, line: Line, c: SyntaxNode, mode: Mode): string {
  switch (c.name) {
    case "QuoteMark":
      return "";
    case "Emphasis":
      return wrapMarks(ctx, line, c, "em", "EmphasisMark", mode);
    case "StrongEmphasis":
      return wrapMarks(ctx, line, c, "strong", "EmphasisMark", mode);
    case "Strikethrough":
      return wrapMarks(ctx, line, c, "del", "StrikethroughMark", mode);
    case "Subscript":
      return wrapMarks(ctx, line, c, "del", "SubscriptMark", mode);
    case "InlineCode": {
      const html = renderCode(ctx, line, c);
      return mode === "plain" ? html.replace(/<\/?code>/g, "") : html;
    }
    case "Link":
    case "Image":
      return renderLink(ctx, line, c, mode);
    case "Autolink":
    case "URL":
      return renderAutolink(ctx, line, c, mode);
    case "Escape":
      line.start = false;
      return escapeHtml(ctx.src.slice(c.from + 1, c.to));
    case "Entity": {
      line.start = false;
      const m = /^&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z0-9]+));$/.exec(
        ctx.src.slice(c.from, c.to),
      );
      const raw = ctx.src.slice(c.from, c.to);
      return escapeHtml(m === null ? raw : decodeReference(raw, m[1], m[2], m[3]));
    }
    case "HardBreak":
      line.start = true;
      return mode === "plain" ? "\n" : "<br />\n";
    case "HTMLTag":
    case "Comment":
    case "ProcessingInstruction": {
      line.start = false;
      if (mode === "plain") return "";
      return filterRaw(ctx, sourceWithoutMarks(ctx, c, c.from, c.to));
    }
    default:
      // Superscript, Emoji and anything unknown: keep the source text.
      return renderLiteral(ctx, line, c);
  }
}

function inlineRange(ctx: Ctx, node: SyntaxNode, from: number, to: number): string {
  const end = trimEndPos(ctx.src, from, to);
  return renderInline(ctx, { start: false }, node, from, end, "html");
}

// --------------------------------------------------------------------------
// Block rendering

function hasBlankLineBetween(src: string, from: number, to: number): boolean {
  if (to <= from) return false;
  const pieces = src.slice(from, to).split("\n");
  for (let i = 1; i < pieces.length - 1; i++) {
    if (/^[\s>]*$/.test(pieces[i] ?? "")) return true;
  }
  return false;
}

function itemBlocks(item: SyntaxNode): SyntaxNode[] {
  return kids(item).filter((c) => c.name !== "ListMark");
}

function isLoose(ctx: Ctx, list: SyntaxNode): boolean {
  const items = list.getChildren("ListItem");
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prev = items[i - 1];
    if (item === undefined) continue;
    if (prev !== undefined && hasBlankLineBetween(ctx.src, prev.to, item.from)) return true;
    const blocks = itemBlocks(item);
    for (let j = 1; j < blocks.length; j++) {
      const a = blocks[j - 1];
      const b = blocks[j];
      if (a !== undefined && b !== undefined && hasBlankLineBetween(ctx.src, a.to, b.from)) {
        return true;
      }
    }
  }
  return false;
}

function column(src: string, pos: number): number {
  return pos - (src.lastIndexOf("\n", pos - 1) + 1);
}

function fenceIndent(ctx: Ctx, mark: SyntaxNode, parent: SyntaxNode | null): number {
  const src = ctx.src;
  let i = mark.from;
  let spaces = 0;
  while (i > 0 && (src[i - 1] === " " || src[i - 1] === "\t")) {
    i--;
    spaces++;
  }
  const before = i > 0 ? src[i - 1] : "\n";
  if (before === ">") return Math.max(0, spaces - 1);
  if (before !== "\n") return 0;
  if (parent?.name === "ListItem") {
    const first = itemBlocks(parent)[0];
    const base = first === undefined ? 0 : column(src, first.from);
    return Math.max(0, spaces - base);
  }
  return spaces;
}

function stripIndent(text: string, max: number): string {
  if (max <= 0) return text;
  return text
    .split("\n")
    .map((l) => {
      let n = 0;
      while (n < max && l[n] === " ") n++;
      return l.slice(n);
    })
    .join("\n");
}

function renderFencedCode(ctx: Ctx, node: SyntaxNode): string {
  const marks = node.getChildren("CodeMark");
  const open = marks[0];
  const close = marks.length > 1 ? lastOf(marks) : undefined;
  const infoNode = node.getChild("CodeInfo");
  let cls = "";
  if (infoNode !== null) {
    const info = unescapeString(ctx.src.slice(infoNode.from, infoNode.to).trim());
    const lang = info.split(/\s+/)[0] ?? "";
    if (lang.length > 0) cls = ` class="language-${escapeHtml(lang)}"`;
  }
  let content = node
    .getChildren("CodeText")
    .map((t) => ctx.src.slice(t.from, t.to))
    .join("");
  if (content.length > 0) {
    // Lezer drops the newline before a closing fence; an unclosed fence keeps its own.
    if (close !== undefined || !content.endsWith("\n")) content += "\n";
  } else if (open !== undefined && close !== undefined) {
    const between = ctx.src.slice(open.to, close.from);
    const newlines = between.split("\n").length - 1;
    if (newlines >= 2) content = "\n".repeat(newlines - 1);
  }
  if (open !== undefined) content = stripIndent(content, fenceIndent(ctx, open, node.parent));
  return `<pre><code${cls}>${escapeHtml(content)}</code></pre>`;
}

function renderIndentedCode(ctx: Ctx, node: SyntaxNode): string {
  const raw = node
    .getChildren("CodeText")
    .map((t) => ctx.src.slice(t.from, t.to))
    .join("")
    .replace(/(?:\n[ \t]*)+$/, "");
  return `<pre><code>${escapeHtml(raw)}\n</code></pre>`;
}

function renderParagraphLike(
  ctx: Ctx,
  node: SyntaxNode,
  tight: boolean,
  from: number,
  prefix = "",
): string {
  const inner = prefix + inlineRange(ctx, node, from, node.to);
  return tight ? inner : `<p>${inner}</p>`;
}

function renderHeading(ctx: Ctx, node: SyntaxNode): string {
  const level = Number(node.name.slice(-1));
  const marks = node.getChildren("HeaderMark");
  let from = node.from;
  let to = node.to;
  if (node.name.startsWith("ATX")) {
    const first = marks[0];
    const last = lastOf(marks);
    if (first !== undefined) from = first.to;
    if (last !== undefined && last !== first) to = last.from;
  } else {
    const last = lastOf(marks);
    if (last !== undefined) to = last.from;
  }
  while (from < to && /\s/.test(ctx.src[from] ?? "")) from++;
  const inner = renderInline(
    ctx,
    { start: false },
    node,
    from,
    trimEndPos(ctx.src, from, to),
    "html",
  ).trim();
  return `<h${String(level)}>${inner}</h${String(level)}>`;
}

function renderTable(ctx: Ctx, node: SyntaxNode): string {
  const delimiter = node.getChild("TableDelimiter");
  const cells = (ctx.src.slice(delimiter?.from ?? 0, delimiter?.to ?? 0) || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((s) => s.trim());
  const aligns = cells.map((s) => {
    const left = s.startsWith(":");
    const right = s.endsWith(":");
    if (left && right) return "center";
    if (left) return "left";
    if (right) return "right";
    return "";
  });
  const renderRow = (row: SyntaxNode, tag: string): string => {
    const rowCells = row.getChildren("TableCell");
    let out = "<tr>\n";
    for (let i = 0; i < aligns.length; i++) {
      const cell = rowCells[i];
      const align = aligns[i] ?? "";
      const attr = align === "" ? "" : ` align="${align}"`;
      let inner = "";
      if (cell !== undefined) {
        const prev = ctx.inTable;
        ctx.inTable = true;
        inner = renderInline(
          ctx,
          { start: false },
          cell,
          cell.from,
          trimEndPos(ctx.src, cell.from, cell.to),
          "html",
        ).trim();
        ctx.inTable = prev;
      }
      out += `<${tag}${attr}>${inner}</${tag}>\n`;
    }
    return out + "</tr>";
  };
  const header = node.getChild("TableHeader");
  const rows = node.getChildren("TableRow");
  let out = "<table>\n";
  if (header !== null) out += `<thead>\n${renderRow(header, "th")}\n</thead>\n`;
  if (rows.length > 0)
    out += `<tbody>\n${rows.map((r) => renderRow(r, "td")).join("\n")}\n</tbody>\n`;
  return out + "</table>";
}

function renderListItem(ctx: Ctx, item: SyntaxNode, tight: boolean): string {
  const blocks = itemBlocks(item);
  if (blocks.length === 0) return "<li></li>";
  const parts = blocks.map((b) => renderBlock(ctx, b, tight)).filter((s) => s.length > 0);
  const firstName = blocks[0]?.name;
  if (tight && (firstName === "Paragraph" || firstName === "Task")) {
    const [head = "", ...rest] = parts;
    return rest.length > 0 ? `<li>${head}\n${rest.join("\n")}\n</li>` : `<li>${head}</li>`;
  }
  return `<li>\n${parts.join("\n")}\n</li>`;
}

function renderList(ctx: Ctx, node: SyntaxNode): string {
  const tight = !isLoose(ctx, node);
  const items = node.getChildren("ListItem").map((i) => renderListItem(ctx, i, tight));
  if (node.name === "BulletList") return `<ul>\n${items.join("\n")}\n</ul>`;
  const firstMark = node.getChild("ListItem")?.getChild("ListMark");
  const start =
    firstMark === null || firstMark === undefined
      ? 1
      : parseInt(ctx.src.slice(firstMark.from, firstMark.to), 10);
  const attr = Number.isNaN(start) || start === 1 ? "" : ` start="${String(start)}"`;
  return `<ol${attr}>\n${items.join("\n")}\n</ol>`;
}

function renderBlock(ctx: Ctx, node: SyntaxNode, tight: boolean): string {
  switch (node.name) {
    case "Paragraph":
      return renderParagraphLike(ctx, node, tight, node.from);
    case "Task": {
      const marker = node.getChild("TaskMarker");
      const checked = marker !== null && /[xX]/.test(ctx.src.slice(marker.from, marker.to));
      const box = `<input${checked ? ' checked=""' : ""} disabled="" type="checkbox" />`;
      return renderParagraphLike(ctx, node, tight, marker?.to ?? node.from, box);
    }
    case "ATXHeading1":
    case "ATXHeading2":
    case "ATXHeading3":
    case "ATXHeading4":
    case "ATXHeading5":
    case "ATXHeading6":
    case "SetextHeading1":
    case "SetextHeading2":
      return renderHeading(ctx, node);
    case "Blockquote": {
      const inner = renderBlocks(ctx, kids(node), false);
      return inner === "" ? "<blockquote>\n</blockquote>" : `<blockquote>\n${inner}\n</blockquote>`;
    }
    case "BulletList":
    case "OrderedList":
      return renderList(ctx, node);
    case "FencedCode":
      return renderFencedCode(ctx, node);
    case "CodeBlock":
      return renderIndentedCode(ctx, node);
    case "HorizontalRule":
      return "<hr />";
    case "HTMLBlock":
    case "CommentBlock":
    case "ProcessingInstructionBlock":
      return filterRaw(ctx, sourceWithoutMarks(ctx, node, node.from, node.to).replace(/\n+$/, ""));
    case "Table":
      return renderTable(ctx, node);
    default:
      return "";
  }
}

function renderBlocks(ctx: Ctx, nodes: SyntaxNode[], tight: boolean): string {
  return nodes
    .map((n) => renderBlock(ctx, n, tight))
    .filter((s) => s.length > 0)
    .join("\n");
}

function collectReferences(ctx: Ctx, root: SyntaxNode): void {
  const visit = (node: SyntaxNode): void => {
    if (node.name === "LinkReference") {
      const label = node.getChild("LinkLabel");
      const url = node.getChild("URL");
      if (label !== null && url !== null) {
        const key = normalizeLabel(ctx.src.slice(label.from + 1, label.to - 1));
        if (!ctx.refs.has(key)) {
          let dest = ctx.src.slice(url.from, url.to);
          if (dest.startsWith("<") && dest.endsWith(">")) dest = dest.slice(1, -1);
          ctx.refs.set(key, { url: dest, title: linkTitle(ctx, node.getChild("LinkTitle")) });
        }
      }
      return;
    }
    for (const c of kids(node)) visit(c);
  };
  visit(root);
}

export function renderToHtml(markdown: string, options: RenderOptions = {}): string {
  const tree = markdownLanguage.parser.parse(markdown);
  const ctx: Ctx = {
    src: markdown,
    refs: new Map(),
    tagfilter: options.tagfilter ?? false,
    inTable: false,
  };
  collectReferences(ctx, tree.topNode);
  const body = renderBlocks(ctx, kids(tree.topNode), false);
  return body === "" ? "" : `${body}\n`;
}
