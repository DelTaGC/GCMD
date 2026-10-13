/**
 * Keeps the sidebar outline in step with the editor. Headings are
 * recomputed (debounced) after the document or its syntax tree changed; a
 * selection change only re-runs the cheap "which section am I in" lookup
 * over the cached list. Clicking a heading jumps through
 * `commands/cursor.ts`.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { Sidebar } from "../chrome/sidebar";
import { jumpTo } from "../editor/commands/cursor";
import {
  activeHeading,
  buildOutline,
  collectHeadings,
  sameHeadings,
  type Heading,
} from "../editor/outline";

/** Quiet period after the last change before the outline is recomputed. */
export const OUTLINE_DEBOUNCE_MS = 150;

export interface OutlineController {
  /** Hook for `EditorView.updateListener`. */
  onEditorUpdate(update: ViewUpdate): void;
  /** Recomputes now (after a document was loaded: `setState` fires no update). */
  refresh(): void;
  /** The headings as last computed. */
  readonly headings: readonly Heading[];
}

export function createOutlineController(view: EditorView, sidebar: Sidebar): OutlineController {
  let headings: Heading[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const updateActive = (): void => {
    sidebar.setActive(activeHeading(headings, view.state.selection.main.head));
  };

  const recompute = (): void => {
    timer = null;
    const next = collectHeadings(view.state);
    if (!sameHeadings(headings, next)) {
      headings = next;
      sidebar.setOutline(buildOutline(headings));
    }
    updateActive();
  };

  const schedule = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(recompute, OUTLINE_DEBOUNCE_MS);
  };

  sidebar.onJump((heading) => {
    jumpTo(view, heading.from);
  });
  recompute();

  return {
    get headings(): readonly Heading[] {
      return headings;
    },
    onEditorUpdate(update): void {
      if (update.docChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        schedule();
      } else if (update.selectionSet) {
        updateActive();
      }
    },
    refresh(): void {
      if (timer !== null) {
        clearTimeout(timer);
      }
      recompute();
    },
  };
}
