/**
 * Settings controller: owns the appearance, keymap overrides and spell-check
 * settings, applies them live (CSS variables, the editor keymap, the
 * editor's spellcheck attribute), persists every change, and registers
 * `file.settings`, which opens the panel (`chrome/settings/panel.ts`).
 *
 * The native menu consumes its accelerators before the webview sees the key
 * (Windows), so while the panel records a shortcut `interceptMenu` turns a
 * menu event back into the key that triggered it.
 */
import type { EditorView } from "@codemirror/view";
import { createSettingsPanel, type CommandRow, type SettingsPanel } from "../chrome/settings/panel";
import { defineCommand, listCommands } from "../editor/commands";
import { keysFor, setKeymapOverrides, shortcuts, type KeymapOverrides } from "../editor/keymap";
import { assignKey, isCustomized, removeKey, resetCommand } from "../editor/keymapEdit";
import { setSpellcheck } from "../editor/spellcheck";
import { isMac } from "../ipc/env";
import type { AppearanceSettings, Settings } from "../ipc/settings";
import { applyAppearance } from "./appearance";

export interface SettingsPersistence {
  appearance(next: AppearanceSettings): Promise<unknown>;
  keymap(next: KeymapOverrides): Promise<unknown>;
  spellcheck(enabled: boolean): Promise<unknown>;
}

/** The zoom controller's text size (`app/zoom.ts`), which the panel edits. */
export interface TextSize {
  readonly fontSize: number;
  setFontSize(size: number): void;
}

export interface SettingsControllerDeps {
  view: EditorView;
  textSize: TextSize;
  initial: Settings;
  persist: SettingsPersistence;
}

export interface SettingsController {
  readonly panel: SettingsPanel;
  open(): void;
  /**
   * Called with every native menu event before it runs: true when the panel
   * took it (a shortcut being recorded, or an editing command that must not
   * reach the hidden editor while the panel is open).
   */
  interceptMenu(id: string): boolean;
}

/** Menu ids that still run while the panel is open. */
const WINDOW_COMMANDS = /^(file|view|help)\.|^recent:/;

function logFailure(what: string): (err: unknown) => void {
  return (err) => {
    console.warn(`saving ${what} failed`, err);
  };
}

/** Every bindable command: registered ones plus the shortcut table's, sorted by title. */
function commandRows(overrides: KeymapOverrides): CommandRow[] {
  const titles = new Map<string, string>();
  for (const command of listCommands()) {
    titles.set(command.id, command.title);
  }
  for (const s of shortcuts) {
    if (!titles.has(s.command)) {
      titles.set(s.command, s.command);
    }
  }
  return [...titles.entries()]
    .map(([id, title]) => ({
      id,
      title,
      keys: keysFor(id),
      customized: isCustomized(overrides, id),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function createSettingsController(deps: SettingsControllerDeps): SettingsController {
  const { view, persist } = deps;
  let appearance = deps.initial.appearance;
  let keymap: KeymapOverrides = deps.initial.keymap;
  let spellcheck = deps.initial.spellcheck;

  const snapshot = (): {
    appearance: AppearanceSettings;
    fontSize: number;
    spellcheck: boolean;
    commands: CommandRow[];
  } => ({
    appearance,
    fontSize: deps.textSize.fontSize,
    spellcheck,
    commands: commandRows(keymap),
  });

  const refresh = (): void => {
    if (panel.isOpen) {
      panel.update(snapshot());
    }
  };

  const setKeymap = (next: KeymapOverrides): void => {
    keymap = next;
    setKeymapOverrides(view, keymap);
    persist.keymap(keymap).catch(logFailure("shortcuts"));
    refresh();
  };

  const titleOf = (id: string): string => listCommands().find((c) => c.id === id)?.title ?? id;

  const panel = createSettingsPanel(
    {
      onAppearance: (next) => {
        appearance = next;
        applyAppearance(appearance);
        view.requestMeasure();
        persist.appearance(appearance).catch(logFailure("appearance"));
        refresh();
      },
      onFontSize: (size) => {
        deps.textSize.setFontSize(size);
        refresh();
      },
      onSpellcheck: (enabled) => {
        spellcheck = enabled;
        setSpellcheck(view, enabled);
        persist.spellcheck(enabled).catch(logFailure("spell-check"));
        refresh();
      },
      onAssignKey: (command, key) => {
        const edit = assignKey(keymap, command, key);
        setKeymap(edit.overrides);
        return edit.removedFrom.map(titleOf);
      },
      onRemoveKey: (command, key) => {
        setKeymap(removeKey(keymap, command, key));
      },
      onResetCommand: (command) => {
        setKeymap(resetCommand(keymap, command));
      },
      onResetAllKeys: () => {
        setKeymap({});
      },
      onClose: () => {
        view.focus();
      },
    },
    isMac(),
  );

  applyAppearance(appearance);
  setKeymapOverrides(view, keymap);
  setSpellcheck(view, spellcheck);

  const open = (): void => {
    panel.open(snapshot());
  };

  defineCommand({
    id: "file.settings",
    title: "Settings",
    run: () => {
      open();
      return true;
    },
  });

  return {
    panel,
    open,
    interceptMenu(id: string): boolean {
      if (!panel.isOpen) {
        return false;
      }
      if (panel.isRecording) {
        const key = keysFor(id)[0];
        if (key !== undefined) {
          return panel.takeKey(key);
        }
        return true;
      }
      return !WINDOW_COMMANDS.test(id);
    },
  };
}
