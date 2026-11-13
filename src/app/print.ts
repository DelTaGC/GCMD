/**
 * Printing, which is also the PDF export: `file.print` prints the live
 * preview through the system print dialog, where "Save as PDF" (Windows,
 * macOS) or "Print to File" (Linux) writes the file. There is no second
 * renderer: the editor's own DOM is printed with the `@media print` rules of
 * `styles.css` and `editor/theme/editor.css`.
 *
 * The editor normally draws only the visible lines, and languages, diagrams
 * and images arrive lazily as they scroll into view. All of it has to be in
 * the DOM before the browser lays out the pages, so the flow is:
 *
 * 1. light theme and print mode (`editor/print.ts`: no active block);
 * 2. parse the whole document, load the fence languages, parse again so the
 *    nested code is highlighted, render every mermaid diagram, load images;
 * 3. draw every line (`drawWholeDocument`);
 * 4. open the dialog and wait until it closes;
 * 5. restore the viewport drawing, the theme and the active block.
 *
 * The document is never modified (invariant 1).
 */
import { forceParsing } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { ThemeController } from "../chrome/theme";
import { defineCommand } from "../editor/commands";
import { loadFenceLanguages } from "../editor/livePreview/codeFence";
import { loadImages, releaseImages } from "../editor/livePreview/image";
import { renderAllDiagrams } from "../editor/livePreview/mermaid";
import { drawWholeDocument, setPrintMode } from "../editor/print";
import { printWindow } from "../ipc/window";

export interface PrintDeps {
  view: EditorView;
  theme: ThemeController;
}

export interface PrintController {
  /** Prints the document; resolves once the print dialog has closed. */
  print(): Promise<void>;
}

/** Longest a single full parse may block before printing what is there. */
const PARSE_BUDGET_MS = 5000;
/** Delay before input events count as "the dialog is closed" (see below). */
const INPUT_FALLBACK_MS = 1000;

/**
 * Resolves when the print dialog has closed, after calling `onClosed` from
 * inside the event that said so. `afterprint` says so wherever the page
 * itself asked to print. A natively opened dialog (macOS) may not fire it;
 * the dialog is modal, so after a moment the window getting the focus back,
 * or a key or pointer event reaching the page, means it is gone. `onClosed`
 * runs before that key is handled: it is never typed in print mode.
 */
function printDialogClosed(onClosed: () => void): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0;
    const done = (): void => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
      window.removeEventListener("focus", done);
      window.removeEventListener("keydown", done, true);
      window.removeEventListener("pointerdown", done, true);
      onClosed();
      resolve();
    };
    window.addEventListener("afterprint", done);
    timer = window.setTimeout(() => {
      window.addEventListener("focus", done);
      window.addEventListener("keydown", done, true);
      window.addEventListener("pointerdown", done, true);
    }, INPUT_FALLBACK_MS);
  });
}

/** Makes everything that loads lazily available for the whole document. */
async function prepare(view: EditorView): Promise<void> {
  const end = (): number => view.state.doc.length;
  forceParsing(view, end(), PARSE_BUDGET_MS);
  await Promise.all([
    loadFenceLanguages(view.state),
    renderAllDiagrams(view.state),
    loadImages(view.state),
  ]);
  // Fences whose language was not loaded yet were skipped by the first parse.
  forceParsing(view, end(), PARSE_BUDGET_MS);
}

export function createPrintController(deps: PrintDeps): PrintController {
  const { view, theme } = deps;
  let busy = false;

  const print = async (): Promise<void> => {
    if (busy) {
      return;
    }
    busy = true;
    /** Back to the screen state; safe to call twice. */
    const restore = (): void => {
      void drawWholeDocument(view, false);
      setPrintMode(view, false);
      theme.setOverride(null);
      releaseImages();
    };
    try {
      theme.setOverride("light");
      setPrintMode(view, true);
      await prepare(view);
      // A document loaded meanwhile starts with print mode off.
      setPrintMode(view, true);
      await drawWholeDocument(view, true);
      const closed = printDialogClosed(restore);
      await printWindow();
      await closed;
    } finally {
      restore();
      busy = false;
      view.focus();
    }
  };

  defineCommand({
    id: "file.print",
    title: "Print...",
    run: () => {
      print().catch((err: unknown) => {
        console.error("print failed", err);
      });
      return true;
    },
  });

  return { print };
}
