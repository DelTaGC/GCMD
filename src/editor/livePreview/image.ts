/**
 * Inline images: `![alt](path "title")` renders the picture when the line is
 * not active. Only local files are loaded: the path is resolved against the
 * document's directory by the Rust `resolve_asset` command, which also allows
 * that single file in the asset protocol scope. Remote (`http(s)`) images are
 * left as styled text, so a document never triggers network requests.
 *
 * The `<img>` element helper is shared with table cells (`inlineDom.ts`).
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { currentDocumentPath } from "../document";
import { isTauri } from "../../ipc/env";
import { resolveAssetUrl } from "../../ipc/paths";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** True for a Windows path with a drive letter (`C:\dir\file`, `C:/dir`). */
export function isDrivePath(href: string): boolean {
  return /^[a-z]:[\\/]/i.test(href);
}

/** True for `http://`, `https://`, `mailto:` and other non-file schemes. */
export function isRemote(href: string): boolean {
  return SCHEME.test(href) && !/^file:/i.test(href) && !isDrivePath(href);
}

const resolved = new Map<string, Promise<string | null>>();
/** Resolved URLs kept; `loadImages` raises it for a document with more images. */
let maxResolved = 500;

/** URL usable as `<img src>` for `href` relative to `documentPath`, or null. */
export function imageUrl(documentPath: string | null, href: string): Promise<string | null> {
  if (isRemote(href)) {
    return Promise.resolve(null);
  }
  if (!isTauri()) {
    // Plain browser (`npm run dev`): let the dev server try the path as is.
    return Promise.resolve(href);
  }
  const key = `${documentPath ?? ""}\n${href}`;
  let pending = resolved.get(key);
  if (!pending) {
    pending = resolveAssetUrl(documentPath, href).catch(() => null);
    resolved.set(key, pending);
    if (resolved.size > maxResolved) {
      const oldest = resolved.keys().next().value;
      if (oldest !== undefined) {
        resolved.delete(oldest);
      }
    }
  }
  return pending;
}

/** Forgets resolved URLs (after a save under a new name, paths may change). */
export function clearImageCache(): void {
  resolved.clear();
}

export interface ImageSpec {
  readonly href: string;
  readonly alt: string;
  readonly title: string;
}

/**
 * Builds the picture element: the image once resolved, the alt text styled
 * as a broken image when the file cannot be found or decoded.
 */
export function createImageElement(
  spec: ImageSpec,
  documentPath: string | null,
  onLayout: () => void,
): HTMLElement {
  const holder = document.createElement("span");
  holder.className = "cm-image-widget";
  const broken = (): void => {
    holder.textContent = "";
    const fallback = document.createElement("span");
    fallback.className = "cm-image-broken";
    fallback.textContent = spec.alt || spec.href;
    fallback.title = spec.href;
    holder.append(fallback);
    onLayout();
  };
  void imageUrl(documentPath, spec.href).then((url) => {
    if (!holder.isConnected && !holder.parentNode) {
      // Not attached yet is fine; detached after creation means the widget
      // was dropped and we must not touch it.
    }
    if (url === null) {
      broken();
      return;
    }
    const img = document.createElement("img");
    img.alt = spec.alt;
    if (spec.title) {
      img.title = spec.title;
    }
    img.addEventListener("load", onLayout);
    img.addEventListener("error", broken);
    img.src = url;
    holder.append(img);
  });
  return holder;
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly spec: ImageSpec,
    readonly documentPath: string | null,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return (
      other.spec.href === this.spec.href &&
      other.spec.alt === this.spec.alt &&
      other.spec.title === this.spec.title &&
      other.documentPath === this.documentPath
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    return createImageElement(this.spec, this.documentPath, () => {
      view.requestMeasure();
    });
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** Reads `![alt](href "title")` parts from an `Image` node. */
export function imageSpec(node: SyntaxNode, state: EditorState): ImageSpec | null {
  const url = node.getChild("URL");
  if (!url) {
    return null;
  }
  const marks = node.getChildren("LinkMark");
  const open = marks[0];
  const close = marks[1];
  const alt = open && close ? state.doc.sliceString(open.to, close.from) : "";
  const titleNode = node.getChild("LinkTitle");
  const title = titleNode ? state.doc.sliceString(titleNode.from + 1, titleNode.to - 1) : "";
  return { href: state.doc.sliceString(url.from, url.to), alt, title };
}

/** Hrefs of the local images in the document, each once. */
export function localImageHrefs(state: EditorState): string[] {
  const hrefs = new Set<string>();
  syntaxTree(state).iterate({
    enter: (ref) => {
      if (ref.name !== "Image") {
        return undefined;
      }
      const spec = imageSpec(ref.node, state);
      if (spec && !isRemote(spec.href)) {
        hrefs.add(spec.href);
      }
      return false;
    },
  });
  return [...hrefs];
}

/** Keeps the last preloaded pictures alive so the browser cache holds them. */
const preloaded: HTMLImageElement[] = [];

/**
 * Resolves and downloads every local image of the document. Widgets created
 * afterwards (printing draws the whole document at once) then show their
 * picture from the cache without waiting.
 */
export async function loadImages(state: EditorState): Promise<void> {
  const documentPath = currentDocumentPath(state);
  const hrefs = localImageHrefs(state);
  // None of them may be evicted again before the page is drawn.
  maxResolved = Math.max(maxResolved, hrefs.length);
  const images: HTMLImageElement[] = [];
  await Promise.all(
    hrefs.map(async (href) => {
      const url = await imageUrl(documentPath, href);
      if (url === null) {
        return;
      }
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.addEventListener("load", () => {
          resolve();
        });
        img.addEventListener("error", () => {
          resolve();
        });
        img.src = url;
        images.push(img);
      });
    }),
  );
  preloaded.splice(0, preloaded.length, ...images);
}

/** Lets go of the pictures `loadImages` kept alive, once the printout is done. */
export function releaseImages(): void {
  preloaded.length = 0;
}

/** Widget for the `Image` node, or null when it cannot be rendered inline. */
export function imageWidget(node: SyntaxNode, state: EditorState): ImageWidget | null {
  const spec = imageSpec(node, state);
  if (!spec || isRemote(spec.href)) {
    return null;
  }
  if (state.doc.lineAt(node.from).number !== state.doc.lineAt(node.to).number) {
    // A plugin decoration may not span line breaks.
    return null;
  }
  return new ImageWidget(spec, currentDocumentPath(state));
}
