/**
 * The settings panel: an overlay over the editor window (File > Settings,
 * Ctrl+,) with fonts and sizes, colors per theme, spelling and the keymap
 * editor. Plain DOM; every change goes out through the callbacks and comes
 * back through `update()`, so the panel holds no settings of its own
 * (`app/settings.ts` owns them, persists them and applies them live).
 */
import { COLOR_KEYS, DEFAULT_COLORS, type ColorTheme } from "../../app/appearance";
import type { AppearanceSettings } from "../../ipc/settings";
import { keyNameFromPress, keyProblem } from "../../editor/keyRecord";
import { formatKey } from "../../editor/keymap";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "../../app/zoomLevels";

/** One command row of the keymap editor. */
export interface CommandRow {
  readonly id: string;
  readonly title: string;
  readonly keys: readonly string[];
  readonly customized: boolean;
}

export interface SettingsView {
  readonly appearance: AppearanceSettings;
  /** Editor text size in CSS pixels (the View > Zoom setting). */
  readonly fontSize: number;
  readonly spellcheck: boolean;
  readonly commands: readonly CommandRow[];
}

export interface SettingsPanelCallbacks {
  onAppearance(next: AppearanceSettings): void;
  /** The text size, which is the zoom level (`app/zoom.ts`). */
  onFontSize(size: number): void;
  onSpellcheck(enabled: boolean): void;
  /** Binds `key` to `command`; returns the titles of commands that lost it. */
  onAssignKey(command: string, key: string): readonly string[];
  onRemoveKey(command: string, key: string): void;
  onResetCommand(command: string): void;
  onResetAllKeys(): void;
  onClose(): void;
}

export interface SettingsPanel {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  /** Whether a key is being recorded for the keymap editor. */
  readonly isRecording: boolean;
  open(view: SettingsView): void;
  update(view: SettingsView): void;
  close(): void;
  /** Feeds a key the native menu swallowed (its accelerator) to the recorder. */
  takeKey(key: string): boolean;
}

const FONT_SUGGESTIONS = [
  "Segoe UI",
  "Calibri",
  "Georgia",
  "Cambria",
  "Charter",
  "Iowan Old Style",
  "Inter",
  "Source Serif Pro",
  "Cascadia Mono",
  "Consolas",
  "JetBrains Mono",
  "Fira Code",
  "Menlo",
  "SF Mono",
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const wrapper = el("label", "settings-row");
  wrapper.append(el("span", "settings-label", label), control);
  if (hint !== undefined) {
    wrapper.append(el("span", "settings-hint", hint));
  }
  return wrapper;
}

function numberInput(min: number, max: number, step: number): HTMLInputElement {
  const input = el("input", "settings-number");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createSettingsPanel(
  callbacks: SettingsPanelCallbacks,
  mac: boolean,
): SettingsPanel {
  let current: SettingsView | null = null;
  let recordingFor: string | null = null;
  let filter = "";

  const overlay = el("div", "settings-overlay");
  overlay.hidden = true;
  const panel = el("div", "settings-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "settings-title");
  overlay.append(panel);

  const header = el("div", "settings-header");
  const title = el("h2", undefined, "Settings");
  title.id = "settings-title";
  const closeButton = el("button", "settings-close", "×");
  closeButton.type = "button";
  closeButton.title = "Close (Escape)";
  header.append(title, closeButton);
  const body = el("div", "settings-body");
  panel.append(header, body);

  // --- Text -----------------------------------------------------------------
  const fonts = el("datalist");
  fonts.id = "settings-fonts";
  for (const name of FONT_SUGGESTIONS) {
    const option = el("option");
    option.value = name;
    fonts.append(option);
  }
  const textFont = el("input", "settings-text");
  textFont.setAttribute("list", fonts.id);
  textFont.placeholder = "System font";
  const codeFont = el("input", "settings-text");
  codeFont.setAttribute("list", fonts.id);
  codeFont.placeholder = "Default monospace";
  const fontSize = numberInput(MIN_FONT_SIZE, MAX_FONT_SIZE, 1);
  const codeScale = numberInput(50, 150, 5);
  const lineHeight = numberInput(100, 250, 5);
  const textSection = el("section", "settings-section");
  textSection.append(
    el("h3", undefined, "Text"),
    fonts,
    row("Text font", textFont, "A font name or a CSS list, e.g. Georgia, serif"),
    row("Code font", codeFont),
    row("Text size", fontSize, "px, same as View > Zoom (Ctrl+wheel)"),
    row("Code size", codeScale, "% of the text size"),
    row("Line height", lineHeight, "% of the text size"),
  );

  const emitAppearance = (change: Partial<AppearanceSettings>): void => {
    if (current) {
      callbacks.onAppearance({ ...current.appearance, ...change });
    }
  };
  textFont.addEventListener("change", () => {
    emitAppearance({ textFont: textFont.value.trim() });
  });
  codeFont.addEventListener("change", () => {
    emitAppearance({ codeFont: codeFont.value.trim() });
  });
  const numberChange = (input: HTMLInputElement, field: "codeFontScale" | "lineHeight"): void => {
    input.addEventListener("change", () => {
      const value = Number.parseInt(input.value, 10);
      if (Number.isFinite(value)) {
        emitAppearance({ [field]: clamp(value, Number(input.min), Number(input.max)) });
      }
    });
  };
  fontSize.addEventListener("change", () => {
    const value = Number.parseInt(fontSize.value, 10);
    if (Number.isFinite(value)) {
      callbacks.onFontSize(clamp(value, MIN_FONT_SIZE, MAX_FONT_SIZE));
    }
  });
  numberChange(codeScale, "codeFontScale");
  numberChange(lineHeight, "lineHeight");

  // --- Colors ---------------------------------------------------------------
  const colorTable = el("div", "settings-colors");
  colorTable.append(
    el("span"),
    el("span", "settings-colhead", "Light"),
    el("span", "settings-colhead", "Dark"),
  );
  const colorInputs = new Map<string, HTMLInputElement>();
  const colorField = (theme: ColorTheme, key: string, label: string): HTMLElement => {
    const cell = el("span", "settings-color");
    const input = el("input");
    input.type = "color";
    input.title = `${label} (${theme})`;
    const reset = el("button", "settings-reset", "↺");
    reset.type = "button";
    reset.title = "Back to the default color";
    const field = theme === "light" ? "lightColors" : "darkColors";
    input.addEventListener("input", () => {
      if (current) {
        emitAppearance({ [field]: { ...current.appearance[field], [key]: input.value } });
      }
    });
    reset.addEventListener("click", () => {
      if (current) {
        const next = Object.fromEntries(
          Object.entries(current.appearance[field]).filter(([k]) => k !== key),
        );
        emitAppearance({ [field]: next });
      }
    });
    colorInputs.set(`${theme}:${key}`, input);
    cell.append(input, reset);
    return cell;
  };
  for (const { key, label } of COLOR_KEYS) {
    colorTable.append(
      el("span", "settings-label", label),
      colorField("light", key, label),
      colorField("dark", key, label),
    );
  }
  const resetColors = el("button", "settings-button", "Reset all colors");
  resetColors.type = "button";
  resetColors.addEventListener("click", () => {
    emitAppearance({ lightColors: {}, darkColors: {} });
  });
  const colorSection = el("section", "settings-section");
  colorSection.append(el("h3", undefined, "Colors"), colorTable, resetColors);

  // --- Spelling -------------------------------------------------------------
  const spell = el("input");
  spell.type = "checkbox";
  spell.addEventListener("change", () => {
    callbacks.onSpellcheck(spell.checked);
  });
  const spellLabel = el("label", "settings-check");
  spellLabel.append(spell, el("span", undefined, "Check spelling while typing"));
  const spellSection = el("section", "settings-section");
  spellSection.append(
    el("h3", undefined, "Spelling"),
    spellLabel,
    el(
      "p",
      "settings-hint",
      "Uses the operating system's spell checker and languages; words are checked as you type and edit, and right-clicking an underlined word offers suggestions. Code and URLs are never checked.",
    ),
  );

  // --- Keyboard shortcuts ---------------------------------------------------
  const search = el("input", "settings-text settings-search");
  search.type = "search";
  search.placeholder = "Filter commands or keys";
  const message = el("p", "settings-message");
  message.setAttribute("role", "status");
  const list = el("div", "settings-keys");
  const resetKeys = el("button", "settings-button", "Reset all shortcuts");
  resetKeys.type = "button";
  resetKeys.addEventListener("click", () => {
    callbacks.onResetAllKeys();
    message.textContent = "All shortcuts are back to their defaults.";
  });
  search.addEventListener("input", () => {
    filter = search.value.trim().toLowerCase();
    renderKeys();
  });
  const keySection = el("section", "settings-section");
  keySection.append(el("h3", undefined, "Keyboard shortcuts"), search, message, list, resetKeys);

  body.append(textSection, colorSection, spellSection, keySection);

  const titleOf = (id: string): string => current?.commands.find((c) => c.id === id)?.title ?? id;

  function stopRecording(): void {
    recordingFor = null;
    renderKeys();
  }

  function record(key: string): void {
    const command = recordingFor;
    if (command === null) {
      return;
    }
    const problem = keyProblem(key, mac);
    if (problem !== null) {
      message.textContent = `${formatKey(key)}: ${problem}`;
      return;
    }
    const lost = callbacks.onAssignKey(command, key);
    message.textContent =
      lost.length > 0
        ? `${formatKey(key)} now runs "${titleOf(command)}" (removed from ${lost.map((t) => `"${t}"`).join(", ")}).`
        : `${formatKey(key)} now runs "${titleOf(command)}".`;
    recordingFor = null;
  }

  function renderKeys(): void {
    list.replaceChildren();
    if (!current) {
      return;
    }
    for (const command of current.commands) {
      const labels = command.keys.map(formatKey);
      const haystack = `${command.title} ${command.id} ${labels.join(" ")}`.toLowerCase();
      if (filter !== "" && !haystack.includes(filter)) {
        continue;
      }
      const line = el("div", "settings-keyrow");
      if (command.customized) {
        line.classList.add("customized");
      }
      const name = el("span", "settings-command", command.title);
      name.title = command.id;
      const keys = el("span", "settings-chips");
      command.keys.forEach((key, i) => {
        const chip = el("span", "settings-chip", labels[i] ?? key);
        const remove = el("button", "settings-chip-remove", "×");
        remove.type = "button";
        remove.title = `Remove ${labels[i] ?? key}`;
        remove.addEventListener("click", () => {
          callbacks.onRemoveKey(command.id, key);
          message.textContent = `${labels[i] ?? key} removed from "${command.title}".`;
        });
        chip.append(remove);
        keys.append(chip);
      });
      const add = el("button", "settings-button settings-add");
      add.type = "button";
      if (recordingFor === command.id) {
        add.textContent = "Press a key…";
        add.classList.add("recording");
        add.title = "Escape cancels";
      } else {
        add.textContent = "+";
        add.title = "Add a shortcut";
      }
      add.addEventListener("click", () => {
        recordingFor = recordingFor === command.id ? null : command.id;
        message.textContent =
          recordingFor === null ? "" : `Press the new shortcut for "${command.title}".`;
        renderKeys();
      });
      line.append(name, keys, add);
      if (command.customized) {
        const reset = el("button", "settings-reset", "↺");
        reset.type = "button";
        reset.title = "Back to the default shortcut";
        reset.addEventListener("click", () => {
          callbacks.onResetCommand(command.id);
          message.textContent = `"${command.title}" is back to its default.`;
        });
        line.append(reset);
      }
      list.append(line);
    }
  }

  function render(view: SettingsView): void {
    current = view;
    const a = view.appearance;
    if (document.activeElement !== textFont) {
      textFont.value = a.textFont;
    }
    if (document.activeElement !== codeFont) {
      codeFont.value = a.codeFont;
    }
    fontSize.value = String(view.fontSize);
    codeScale.value = String(a.codeFontScale);
    lineHeight.value = String(a.lineHeight);
    for (const { key } of COLOR_KEYS) {
      for (const theme of ["light", "dark"] as const) {
        const input = colorInputs.get(`${theme}:${key}`);
        const field = theme === "light" ? a.lightColors : a.darkColors;
        const value = field[key] ?? DEFAULT_COLORS[theme][key] ?? "#000000";
        if (input && document.activeElement !== input) {
          input.value = value;
        }
        input?.parentElement?.classList.toggle("customized", key in field);
      }
    }
    spell.checked = view.spellcheck;
    renderKeys();
  }

  // Keys: capture phase on the window so the recorder sees a shortcut
  // before the editor keymap and the Alt+letter menu opener do.
  window.addEventListener(
    "keydown",
    (event) => {
      if (overlay.hidden) {
        return;
      }
      if (recordingFor !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
          message.textContent = "";
          stopRecording();
          return;
        }
        const key = keyNameFromPress(event, mac);
        if (key !== null) {
          record(key);
          renderKeys();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        api.close();
      }
    },
    true,
  );
  closeButton.addEventListener("click", () => {
    api.close();
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) {
      api.close();
    }
  });

  const api: SettingsPanel = {
    element: overlay,
    get isOpen(): boolean {
      return !overlay.hidden;
    },
    get isRecording(): boolean {
      return !overlay.hidden && recordingFor !== null;
    },
    open(view: SettingsView): void {
      message.textContent = "";
      recordingFor = null;
      render(view);
      overlay.hidden = false;
      textFont.focus();
    },
    update(view: SettingsView): void {
      render(view);
    },
    close(): void {
      if (overlay.hidden) {
        return;
      }
      recordingFor = null;
      overlay.hidden = true;
      callbacks.onClose();
    },
    takeKey(key: string): boolean {
      if (recordingFor === null) {
        return false;
      }
      record(key);
      renderKeys();
      return true;
    },
  };
  return api;
}
