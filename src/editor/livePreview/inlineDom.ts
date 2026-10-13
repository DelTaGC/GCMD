/**
 * Renders a snippet of inline markdown (a table cell) to DOM nodes, using the
 * same Lezer parser as the editor so what a cell shows matches what the
 * editor would style. Output is built with DOM APIs, never `innerHTML`, so a
 * document cannot inject markup into the editor.
 */
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { SyntaxNode } from "@lezer/common";
import { createImageElement, isRemote } from "./image";

export interface InlineContext {
  readonly documentPath: string | null;
  /** Called when an asynchronously loaded element changed the layout. */
  readonly onLayout: () => void;
}

/** Child nodes that are markup, not content. */
const SKIPPED = new Set([
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "LinkMark",
  "URL",
  "LinkTitle",
  "LinkLabel",
]);

const WRAPPERS: Record<string, string> = {
  Emphasis: "em",
  StrongEmphasis: "strong",
  Strikethrough: "del",
  InlineCode: "code",
};

function textOf(text: string, node: SyntaxNode): string {
  return text.slice(node.from, node.to);
}

function linkElement(href: string, title: string | null): HTMLElement {
  const link = document.createElement("span");
  link.className = "cm-link";
  link.dataset["href"] = href;
  link.title = title ?? href;
  return link;
}

function renderChildren(
  text: string,
  node: SyntaxNode,
  parent: HTMLElement,
  ctx: InlineContext,
): void {
  let pos = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > pos) {
      parent.append(text.slice(pos, child.from));
    }
    renderNode(text, child, parent, ctx);
    pos = child.to;
  }
  if (node.to > pos) {
    parent.append(text.slice(pos, node.to));
  }
}

function renderNode(text: string, node: SyntaxNode, parent: HTMLElement, ctx: InlineContext): void {
  if (SKIPPED.has(node.name)) {
    return;
  }
  const wrapper = WRAPPERS[node.name];
  if (wrapper !== undefined) {
    const element = document.createElement(wrapper);
    renderChildren(text, node, element, ctx);
    parent.append(element);
    return;
  }
  switch (node.name) {
    case "Link": {
      const url = node.getChild("URL");
      const title = node.getChild("LinkTitle");
      const element = linkElement(
        url ? textOf(text, url) : "",
        title ? textOf(text, title).slice(1, -1) : null,
      );
      renderChildren(text, node, element, ctx);
      parent.append(element);
      return;
    }
    case "Autolink": {
      const url = node.getChild("URL");
      const href = url ? textOf(text, url) : "";
      const element = linkElement(href, null);
      element.textContent = href;
      parent.append(element);
      return;
    }
    case "URL": {
      const href = textOf(text, node);
      const element = linkElement(href, null);
      element.textContent = href;
      parent.append(element);
      return;
    }
    case "Image": {
      const url = node.getChild("URL");
      const marks = node.getChildren("LinkMark");
      const open = marks[0];
      const close = marks[1];
      const alt = open && close ? text.slice(open.to, close.from) : "";
      const href = url ? textOf(text, url) : "";
      if (!url || isRemote(href)) {
        parent.append(alt);
        return;
      }
      const title = node.getChild("LinkTitle");
      parent.append(
        createImageElement(
          { href, alt, title: title ? textOf(text, title).slice(1, -1) : "" },
          ctx.documentPath,
          ctx.onLayout,
        ),
      );
      return;
    }
    case "Escape":
      parent.append(text.slice(node.from + 1, node.to));
      return;
    case "HardBreak":
      parent.append(document.createElement("br"));
      return;
    default:
      // Entities, HTML tags and anything unknown show as their source text.
      parent.append(textOf(text, node));
  }
}

/** Appends the rendered form of the inline markdown `text` to `parent`. */
export function renderInline(text: string, parent: HTMLElement, ctx: InlineContext): void {
  const tree = markdownLanguage.parser.parse(text);
  const paragraph = tree.topNode.firstChild;
  if (!paragraph) {
    return;
  }
  // The parser may see a block construct (a heading, a list); render its
  // children as plain inline content anyway, the cell text is what it is.
  if (paragraph.firstChild) {
    renderChildren(text, paragraph, parent, ctx);
  } else {
    parent.append(text.slice(paragraph.from, paragraph.to));
  }
}
