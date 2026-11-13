/**
 * Link targets for the printout (`app/print.ts`). On screen a link is styled
 * text opened with Ctrl+click; in print mode the live preview emits real
 * `<a href>` elements and heading ids instead, which a browser's own
 * "Save as PDF" turns into clickable links and in-document jumps.
 *
 * Everything here is pure: a destination as written in the markdown becomes
 * the URL a PDF viewer can follow, or `null` when there is none.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { headingAnchors } from "./linkCompletion";
import { classifyLink } from "./links";
import { isDrivePath, isRemote } from "./livePreview/image";
import { collectHeadings } from "./outline";

/** `file://` URL of an absolute path (`D:\a b\c.md`, `/home/x/c.md`). */
export function fileUrl(path: string): string {
  const slashed = path.replace(/\\/g, "/");
  const encoded = encodeURI(slashed).replace(/[?#]/g, (c) => encodeURIComponent(c));
  if (encoded.startsWith("//")) {
    return `file:${encoded}`; // UNC: //server/share
  }
  return encoded.startsWith("/") ? `file://${encoded}` : `file:///${encoded}`;
}

/**
 * The URL to print for the destination `href` of a document at
 * `documentPath`: web and mail links as they open on Ctrl+click, `#heading`
 * as is, a file path as an absolute `file://` URL. `null` for what cannot
 * work in a PDF: a relative path in an untitled document, other schemes.
 */
export function printHref(href: string, documentPath: string | null): string | null {
  let target = href.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1);
  }
  if (target === "" || target === "#") {
    return null;
  }
  if (target.startsWith("#")) {
    return target;
  }
  const { kind, target: opened } = classifyLink(target);
  if (kind === "web" || kind === "mail") {
    return opened;
  }
  try {
    if (isRemote(target)) {
      return null; // a scheme a PDF link should not carry (ftp:, javascript:)
    }
    if (isDrivePath(target)) {
      return new URL(fileUrl(target)).href;
    }
    if (/^file:/i.test(target)) {
      return new URL(target).href;
    }
    if (documentPath === null) {
      return null;
    }
    return new URL(target, fileUrl(documentPath)).href;
  } catch {
    return null;
  }
}

/** Reference labels match case-insensitively with whitespace collapsed. */
function normalizeLabel(label: string): string {
  return label
    .replace(/^\[|\]$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface PrintTargets {
  /** Heading start position -> its GitHub anchor. */
  readonly headingIds: ReadonlyMap<number, string>;
  /** Normalized reference label -> destination (`[label]: url`). */
  readonly references: ReadonlyMap<string, string>;
}

const targetsByState = new WeakMap<EditorState, PrintTargets>();

/** Computed once per state: every family asks for the same document. */
function printTargets(state: EditorState): PrintTargets {
  const cached = targetsByState.get(state);
  if (cached) {
    return cached;
  }
  const headings = collectHeadings(state);
  const anchors = headingAnchors(headings);
  const headingIds = new Map<number, string>();
  headings.forEach((heading, i) => {
    const anchor = anchors[i];
    if (anchor !== undefined && anchor !== "") {
      headingIds.set(heading.from, anchor);
    }
  });
  const references = new Map<string, string>();
  syntaxTree(state).iterate({
    enter: (ref) => {
      if (ref.name !== "LinkReference") {
        return undefined;
      }
      const label = ref.node.getChild("LinkLabel");
      const url = ref.node.getChild("URL");
      if (label && url) {
        const key = normalizeLabel(state.doc.sliceString(label.from, label.to));
        // The first definition of a label wins, as in the spec.
        if (key !== "" && !references.has(key)) {
          references.set(key, state.doc.sliceString(url.from, url.to));
        }
      }
      return false;
    },
  });
  const targets = { headingIds, references };
  targetsByState.set(state, targets);
  return targets;
}

/** The anchor of the heading starting at `from` (what `#links` point to). */
export function headingId(state: EditorState, from: number): string | undefined {
  return printTargets(state).headingIds.get(from);
}

/** The destination a reference label (`[text][label]`) is defined with. */
export function referenceHref(state: EditorState, label: string): string | undefined {
  return printTargets(state).references.get(normalizeLabel(label));
}
