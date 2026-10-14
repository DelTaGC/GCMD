/**
 * Line wrap controller: owns the wrap settings, lays out the text column
 * for the editor's current width (`wrapLayout.ts`), applies it to the
 * editor (`editor/wrap.ts`) and the wrap bar, and persists changes. It
 * registers `view.wrap.off`, `view.wrap.full` and `view.wrap.fixed`, which
 * the View > Line Wrap menu runs.
 */
import type { EditorView } from "@codemirror/view";
import { createWrapBar, type WrapBar } from "../chrome/wrapBar";
import { defineCommand } from "../editor/commands";
import { setEditorWrap } from "../editor/wrap";
import type { WrapMode, WrapSettings } from "../ipc/settings";
import { WRAP_MODE_LABELS, dragTo, nextWrapMode, wrapLayout } from "./wrapLayout";

export interface WrapControllerDeps {
  view: EditorView;
  initial: WrapSettings;
  /** Stores the settings (IPC); a failure is only logged. */
  persist: (settings: WrapSettings) => Promise<unknown>;
}

export interface WrapController {
  readonly bar: WrapBar;
  readonly settings: WrapSettings;
  setMode(mode: WrapMode): void;
  /** Re-applies the layout (after a document load replaced the editor state). */
  refresh(): void;
}

const HINT = "Drag to resize the text column, double-click to change the wrap mode.";

export function createWrapController(deps: WrapControllerDeps): WrapController {
  const { view } = deps;
  let settings: WrapSettings = { ...deps.initial };

  const available = (): number => view.scrollDOM.clientWidth;

  const save = (): void => {
    deps.persist(settings).catch((err: unknown) => {
      console.warn("saving wrap settings failed", err);
    });
  };

  const apply = (): void => {
    const layout = wrapLayout(settings, available());
    setEditorWrap(view, settings.mode !== "off", layout.margin);
    bar.update({
      mode: settings.mode,
      margin: layout.margin,
      text: layout.text,
      title: `${WRAP_MODE_LABELS[settings.mode]}. ${HINT}`,
    });
  };

  const setMode = (mode: WrapMode): void => {
    settings = { ...settings, mode };
    apply();
    save();
  };

  const bar = createWrapBar({
    onDrag: (margin) => {
      settings = dragTo(settings, available(), margin);
      apply();
    },
    onDragEnd: save,
    onCycle: () => {
      setMode(nextWrapMode(settings.mode));
    },
  });

  let lastWidth = -1;
  new ResizeObserver(() => {
    const width = available();
    if (width !== lastWidth) {
      lastWidth = width;
      apply();
    }
  }).observe(view.scrollDOM);

  for (const mode of ["off", "full", "fixed"] as const) {
    defineCommand({
      id: `view.wrap.${mode}`,
      title: WRAP_MODE_LABELS[mode],
      run: () => {
        setMode(mode);
        return true;
      },
    });
  }

  apply();

  return {
    bar,
    get settings(): WrapSettings {
      return settings;
    },
    setMode,
    refresh: apply,
  };
}
