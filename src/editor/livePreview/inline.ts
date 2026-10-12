/**
 * Inline marks: emphasis, strong, strikethrough, inline code, links,
 * autolinks, images (styled only until phase 3), escapes and inline HTML.
 *
 * Content is styled with a mark decoration; the markup characters are hidden
 * when the line is not active.
 */
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { isActive } from "./activeBlock";
import { livePreviewFamily, type Collector, type NodeVisitor } from "./decorate";

const LINK_PARENTS = new Set(["Link", "Image", "Autolink", "LinkReference"]);

function hideChildren(node: SyntaxNode, childName: string, out: Collector): void {
  for (const mark of node.getChildren(childName)) {
    out.hide(mark.from, mark.to);
  }
}

function styleWrapped(
  ref: SyntaxNodeRef,
  state: EditorState,
  out: Collector,
  markName: string,
  className: string,
): void {
  out.mark(ref.from, ref.to, className);
  if (!isActive(state, ref.from, ref.to)) {
    hideChildren(ref.node, markName, out);
  }
}

function linkUrl(node: SyntaxNode, state: EditorState): string | undefined {
  const url = node.getChild("URL");
  return url ? state.doc.sliceString(url.from, url.to) : undefined;
}

/** `[text](url)`, `[text][ref]`, `[ref][]`, `[ref]`. */
function decorateLink(ref: SyntaxNodeRef, state: EditorState, out: Collector): void {
  const node = ref.node;
  const marks = node.getChildren("LinkMark");
  const open = marks[0];
  const close = marks[1];
  const url = linkUrl(node, state);
  const textFrom = open ? open.to : ref.from;
  const textTo = close ? close.from : ref.to;
  out.mark(textFrom, textTo, "cm-link", url === undefined ? undefined : { title: url });
  if (isActive(state, ref.from, ref.to)) {
    for (const mark of marks) {
      out.mark(mark.from, mark.to, "cm-mark");
    }
    const target = node.getChild("URL");
    if (target) {
      out.mark(target.from, target.to, "cm-url");
    }
    return;
  }
  if (open) {
    out.hide(open.from, open.to);
  }
  if (close) {
    out.hide(close.from, ref.to);
  }
}

/** `<https://example.com>`: style the URL, hide the angle brackets. */
function decorateAutolink(ref: SyntaxNodeRef, state: EditorState, out: Collector): void {
  const node = ref.node;
  const url = node.getChild("URL");
  if (url) {
    out.mark(url.from, url.to, "cm-link");
  }
  if (!isActive(state, ref.from, ref.to)) {
    hideChildren(node, "LinkMark", out);
  }
}

export const visitInline: NodeVisitor = (ref, state, out) => {
  switch (ref.name) {
    case "Emphasis":
      styleWrapped(ref, state, out, "EmphasisMark", "cm-em");
      return undefined;
    case "StrongEmphasis":
      styleWrapped(ref, state, out, "EmphasisMark", "cm-strong");
      return undefined;
    case "Strikethrough":
      styleWrapped(ref, state, out, "StrikethroughMark", "cm-strike");
      return undefined;
    case "InlineCode":
      styleWrapped(ref, state, out, "CodeMark", "cm-inline-code");
      return false;
    case "Link":
      decorateLink(ref, state, out);
      return undefined;
    case "Autolink":
      decorateAutolink(ref, state, out);
      return false;
    case "URL":
      // A bare GFM autolink (www., http(s)://, email). URLs inside Link,
      // Image, Autolink and LinkReference nodes belong to their parents.
      if (!LINK_PARENTS.has(ref.node.parent?.name ?? "")) {
        out.mark(ref.from, ref.to, "cm-link");
      }
      return false;
    case "Image":
      out.mark(ref.from, ref.to, "cm-image");
      return false;
    case "Escape":
      if (!isActive(state, ref.from, ref.to)) {
        out.hide(ref.from, ref.from + 1);
      } else {
        out.mark(ref.from, ref.from + 1, "cm-mark");
      }
      return false;
    case "HTMLTag":
      out.mark(ref.from, ref.to, "cm-html");
      return false;
    case "LinkReference":
      out.mark(ref.from, ref.to, "cm-link-reference");
      return false;
    default:
      return undefined;
  }
};

export const inline = livePreviewFamily(visitInline);
