/**
 * Zoom controller: owns the editor text size, applies it to the editor
 * (`editor/zoom.ts`), shows the zoom badge, and persists the size shortly
 * after the last change. Ctrl+mouse wheel (and a touchpad pinch, which
 * arrives as one) zooms anywhere in the window. It registers `view.zoom.in`,
 * `view.zoom.out` and `view.zoom.reset`, which View > Zoom and the keymap run.
 */
import type { EditorView } from "@codemirror/view";
import { createZoomBadge, type ZoomBadge } from "../chrome/zoomBadge";
import { defineCommand } from "../editor/commands";
import { setEditorFontSize } from "../editor/zoom";
import { DEFAULT_FONT_SIZE, clampFontSize, wheelSteps, zoomPercent, zoomStep } from "./zoomLevels";

export interface ZoomControllerDeps {
  view: EditorView;
  initial: number;
  /** Stores the size (IPC); a failure is only logged. */
  persist: (size: number) => Promise<unknown>;
  /** The size changed; `scale` is the size over the default size. */
  onScale: (scale: number) => void;
}

export interface ZoomController {
  readonly badge: ZoomBadge;
  readonly fontSize: number;
  setFontSize(size: number): void;
}

/** Wheel zooming changes the size many times a second; save once it settles. */
const PERSIST_DELAY_MS = 500;

export function createZoomController(deps: ZoomControllerDeps): ZoomController {
  const { view } = deps;
  const badge = createZoomBadge();
  let fontSize = clampFontSize(deps.initial);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const save = (): void => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      deps.persist(fontSize).catch((err: unknown) => {
        console.warn("saving the text size failed", err);
      });
    }, PERSIST_DELAY_MS);
  };

  const apply = (): void => {
    setEditorFontSize(view, fontSize);
    deps.onScale(fontSize / DEFAULT_FONT_SIZE);
  };

  const setFontSize = (size: number): void => {
    const next = clampFontSize(size);
    badge.show(`Text size ${String(zoomPercent(next))}%`);
    if (next === fontSize) {
      return;
    }
    fontSize = next;
    apply();
    save();
  };

  const commands = [
    { id: "view.zoom.in", title: "Zoom In", size: (): number => zoomStep(fontSize, 1) },
    { id: "view.zoom.out", title: "Zoom Out", size: (): number => zoomStep(fontSize, -1) },
    { id: "view.zoom.reset", title: "Reset Zoom", size: (): number => DEFAULT_FONT_SIZE },
  ];
  for (const command of commands) {
    defineCommand({
      id: command.id,
      title: command.title,
      run: () => {
        setFontSize(command.size());
        return true;
      },
    });
  }

  let pending = 0;
  window.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) {
        return;
      }
      // Keeps the webview from zooming the whole page and the editor from scrolling.
      event.preventDefault();
      const result = wheelSteps(pending, event.deltaY, event.deltaMode);
      pending = result.pending;
      if (result.steps !== 0) {
        setFontSize(zoomStep(fontSize, result.steps));
      }
    },
    { capture: true, passive: false },
  );

  apply();

  return {
    badge,
    get fontSize(): number {
      return fontSize;
    },
    setFontSize,
  };
}
