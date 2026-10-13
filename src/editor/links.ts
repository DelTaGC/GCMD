/**
 * Ctrl+click (Cmd+click on macOS) on a link.
 *
 * - `http(s)://`, `www.` and e-mail links open in the default browser or
 *   mail client;
 * - `.md` / `.markdown` links open the target in a new GCMD window
 *   (one window edits one file, CLAUDE.md invariant 6);
 * - anything else is ignored.
 *
 * Works on the plain text of an inactive line, on the raw `[text](url)` of
 * an active line, and on links rendered inside table cells (they carry a
 * `data-href` attribute). While Ctrl is held the editor shows a pointer
 * cursor over links.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { openNewWindow } from "../ipc/app";
import { isTauri } from "../ipc/env";
import { resolvePath } from "../ipc/paths";
import { openExternal } from "../ipc/shell";
import { currentDocumentPath } from "./document";

const LINK_NODES = new Set(["Link", "Autolink", "Image"]);

function hrefOf(node: SyntaxNode, state: EditorState): string | null {
  if (node.name === "URL") {
    return state.doc.sliceString(node.from, node.to);
  }
  if (LINK_NODES.has(node.name)) {
    const url = node.getChild("URL");
    return url ? state.doc.sliceString(url.from, url.to) : null;
  }
  return null;
}

/** The destination of the link whose source contains `pos`, if any. */
export function linkAt(state: EditorState, pos: number): string | null {
  const tree = syntaxTree(state);
  for (const side of [1, -1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(pos, side);
    while (node) {
      const href = hrefOf(node, state);
      if (href !== null) {
        return href;
      }
      node = node.parent;
    }
  }
  return null;
}

export type LinkKind = "web" | "mail" | "markdown" | "other";

/** Classifies a destination; `www.` and e-mail autolinks get their scheme. */
export function classifyLink(href: string): { kind: LinkKind; target: string } {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: "web", target: trimmed };
  }
  if (/^www\./i.test(trimmed)) {
    return { kind: "web", target: `https://${trimmed}` };
  }
  if (/^mailto:/i.test(trimmed)) {
    return { kind: "mail", target: trimmed };
  }
  if (/^[^\s/:@]+@[^\s/:@]+\.[^\s/:@]+$/.test(trimmed)) {
    return { kind: "mail", target: `mailto:${trimmed}` };
  }
  const path = trimmed.split(/[?#]/, 1)[0] ?? "";
  if (
    /\.(md|markdown)$/i.test(path) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(path.replace(/^[a-z]:[\\/]/i, ""))
  ) {
    return { kind: "markdown", target: trimmed };
  }
  return { kind: "other", target: trimmed };
}

async function openLink(state: EditorState, href: string): Promise<void> {
  const { kind, target } = classifyLink(href);
  switch (kind) {
    case "web":
    case "mail":
      await openExternal(target);
      return;
    case "markdown": {
      if (!isTauri()) {
        return;
      }
      const path = await resolvePath(currentDocumentPath(state), target);
      await openNewWindow(path);
      return;
    }
    default:
      return;
  }
}

function hrefFromEvent(event: MouseEvent, view: EditorView): string | null {
  const element = event.target instanceof Element ? event.target : null;
  const carried = element?.closest<HTMLElement>("[data-href]")?.dataset["href"];
  if (carried !== undefined) {
    return carried;
  }
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  return pos === null ? null : linkAt(view.state, pos);
}

const CTRL_CLASS = "cm-ctrl-held";

export const linkOpener: Extension = [
  EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) {
        return false;
      }
      const href = hrefFromEvent(event, view);
      if (href === null) {
        return false;
      }
      event.preventDefault();
      openLink(view.state, href).catch((err: unknown) => {
        console.warn(`could not open ${href}`, err);
      });
      return true;
    },
    keydown(event, view) {
      if (event.key === "Control" || event.key === "Meta") {
        view.dom.classList.add(CTRL_CLASS);
      }
      return false;
    },
    keyup(event, view) {
      if (event.key === "Control" || event.key === "Meta") {
        view.dom.classList.remove(CTRL_CLASS);
      }
      return false;
    },
    blur(_event, view) {
      view.dom.classList.remove(CTRL_CLASS);
      return false;
    },
  }),
];
