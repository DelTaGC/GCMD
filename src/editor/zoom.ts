/**
 * Editor text size as the `--editor-font-size` CSS variable on the editor
 * root, which `theme/editor.css` uses as the base size; everything in the
 * document is sized in `em` from it. The size is decided by `app/zoom.ts`.
 */
import { EditorView } from "@codemirror/view";

/**
 * The line kept at the top while a size change waits for the editor to
 * measure; until then the height map is stale, so a second change in the
 * same frame (a fast wheel) must reuse it. `null`: at the very top.
 */
const pendingAnchor = new WeakMap<EditorView, number | null>();

function topAnchor(view: EditorView): number | null {
  if (view.scrollDOM.scrollTop <= 0) {
    return null;
  }
  const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  return view.lineBlockAtHeight(top).from;
}

/**
 * Sets the text size in pixels. The line at the top of the viewport stays
 * there, so zooming in the middle of a long document does not jump away.
 */
export function setEditorFontSize(view: EditorView, size: number): void {
  const value = `${String(size)}px`;
  if (view.dom.style.getPropertyValue("--editor-font-size") === value) {
    return;
  }
  const pending = pendingAnchor.get(view);
  const anchor = pending === undefined ? topAnchor(view) : pending;
  view.dom.style.setProperty("--editor-font-size", value);
  view.requestMeasure();
  // At the very top the content padding stays visible instead.
  if (anchor !== null) {
    view.dispatch({ effects: EditorView.scrollIntoView(anchor, { y: "start", yMargin: 0 }) });
  }
  if (pending === undefined) {
    pendingAnchor.set(view, anchor);
    // The measure cycle that runs this also refreshes the heights and
    // applies the scroll before any other script can run.
    view.requestMeasure({
      read: () => {
        pendingAnchor.delete(view);
      },
    });
  }
}
