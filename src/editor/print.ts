/**
 * Print mode as editor configuration: a compartment holding the `printing`
 * facet. While it is on, the active-block rule reveals no markup
 * (`livePreview/activeBlock.ts`), so the block under the cursor prints
 * rendered like every other one. The flow that turns it on and off is
 * `app/print.ts`; the page layout is the `@media print` rules in
 * `theme/editor.css` and `src/styles.css`.
 */
import { Compartment, Facet, type EditorState, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

const printCompartment = new Compartment();

const printing = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
});

/** Install once; `setPrintMode` switches it later. A new state starts off. */
export function printExtension(on = false): Extension {
  return printCompartment.of(on ? printing.of(true) : []);
}

export function isPrinting(state: EditorState): boolean {
  return state.facet(printing);
}

/**
 * CodeMirror's switch for drawing every line instead of the visible ones.
 * It is internal (`viewState.printing`, not in the type declarations, read
 * in @codemirror/view 6.43): CodeMirror sets it itself when the `print`
 * media query starts matching, but Chromium has already counted the pages by
 * then, so the printout stops where the screen layout ended. Setting it
 * before the dialog opens puts the whole document in the DOM first.
 */
const MEASURE_TIMEOUT_MS = 2000;

interface WholeDocumentSwitch {
  printing: boolean;
}

function wholeDocumentSwitch(view: EditorView): WholeDocumentSwitch | null {
  const viewState: unknown = (view as { viewState?: unknown }).viewState;
  if (
    typeof viewState === "object" &&
    viewState !== null &&
    "printing" in viewState &&
    typeof viewState.printing === "boolean"
  ) {
    return viewState as WholeDocumentSwitch;
  }
  return null;
}

/**
 * Draws the whole document (`on`) or only the viewport again, and resolves
 * once the view has been measured and redrawn. Resolves `false` when this
 * CodeMirror version has no such switch; printing then relies on what
 * CodeMirror does on its own.
 */
export function drawWholeDocument(view: EditorView, on: boolean): Promise<boolean> {
  const target = wholeDocumentSwitch(view);
  if (!target) {
    console.warn("CodeMirror print switch not found; long documents may print incomplete");
    return Promise.resolve(false);
  }
  // CodeMirror's own print handler turns the switch off again 500 ms after
  // the print media query matched. A dialog that pauses the page's scripts
  // (Chromium) never lets that run, a native print sheet (macOS) does, and
  // the document would shrink back to the viewport while the sheet is open.
  // So while printing the switch is pinned: it reads true whatever is
  // assigned to it, until it is released here.
  Object.defineProperty(
    target,
    "printing",
    on
      ? { configurable: true, enumerable: true, get: () => true, set: () => undefined }
      : { configurable: true, enumerable: true, writable: true, value: false },
  );
  return new Promise((resolve) => {
    // Measuring runs in an animation frame, which a hidden window never gets.
    const timer = window.setTimeout(() => {
      resolve(true);
    }, MEASURE_TIMEOUT_MS);
    view.requestMeasure({
      read: () => null,
      write: () => {
        window.clearTimeout(timer);
        resolve(true);
      },
    });
  });
}

/** Turns print mode on or off; live-preview families recompute. */
export function setPrintMode(view: EditorView, on: boolean): void {
  if (isPrinting(view.state) !== on) {
    view.dispatch({ effects: printCompartment.reconfigure(on ? printing.of(true) : []) });
  }
}
