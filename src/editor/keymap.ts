/**
 * THE single shortcut table (CLAUDE.md invariant 4).
 *
 * Every binding maps a key to a command id from the registry. Rules:
 * - never bind the backtick, `^`, `¨` or `´` (dead keys on Swiss-French
 *   QWERTZ); `FORBIDDEN_KEYS` is checked by a unit test;
 * - inline code is Ctrl+E, duplicate line is Ctrl+D;
 * - no multi-cursor features; the bindings CodeMirror ships for them are
 *   filtered out of the base keymap below.
 *
 * Native menu accelerators (Rust `menu.rs`) use the same ids; on Windows the
 * menu consumes the key and forwards the id, so both paths run one command.
 */
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { keymap, type KeyBinding } from "@codemirror/view";
import { isMac } from "../ipc/env";
import { runCommand } from "./commands/registry";

export interface Shortcut {
  /** CodeMirror key name, `Mod` = Ctrl on Windows/Linux, Cmd on macOS. */
  readonly key: string;
  readonly command: string;
  /** Shown in menus; defaults to `key` with Mod spelled out. */
  readonly label?: string;
}

/** Characters that are dead keys on the user's layout. Never bind them. */
export const FORBIDDEN_KEYS: readonly string[] = ["`", "^", "¨", "´"];

export const shortcuts: readonly Shortcut[] = [
  // Formatting
  { key: "Mod-b", command: "format.strong" },
  { key: "Mod-i", command: "format.emphasis" },
  { key: "Mod-e", command: "format.inlineCode" },
  { key: "Mod-Shift-x", command: "format.strikethrough" },
  { key: "Mod-k", command: "format.link" },
  { key: "Mod-0", command: "format.paragraph" },
  { key: "Mod-1", command: "format.heading1" },
  { key: "Mod-2", command: "format.heading2" },
  { key: "Mod-3", command: "format.heading3" },
  { key: "Mod-4", command: "format.heading4" },
  { key: "Mod-5", command: "format.heading5" },
  { key: "Mod-6", command: "format.heading6" },
  // Lines (VS Code style)
  { key: "Mod-d", command: "line.duplicate" },
  { key: "Alt-ArrowUp", command: "line.moveUp" },
  { key: "Alt-ArrowDown", command: "line.moveDown" },
  { key: "Shift-Alt-ArrowUp", command: "line.copyUp" },
  { key: "Shift-Alt-ArrowDown", command: "line.copyDown" },
  { key: "Mod-Shift-k", command: "line.delete" },
  { key: "Tab", command: "edit.tab" },
  { key: "Shift-Tab", command: "edit.shiftTab" },
  { key: "Enter", command: "line.continueMarkup" },
  { key: "Backspace", command: "line.deleteMarkupBackward" },
  // Vertical movement steps into rendered tables and diagrams; the shift
  // variants are listed because overriding a key drops its base binding.
  { key: "ArrowDown", command: "cursor.lineDown" },
  { key: "ArrowUp", command: "cursor.lineUp" },
  { key: "Shift-ArrowDown", command: "cursor.selectLineDown" },
  { key: "Shift-ArrowUp", command: "cursor.selectLineUp" },
  // Link completion: the popup keys (Enter, Tab, arrows, Page keys, Escape)
  // are chained into the commands those keys already run.
  { key: "PageDown", command: "cursor.pageDown" },
  { key: "PageUp", command: "cursor.pageUp" },
  { key: "Shift-PageDown", command: "cursor.selectPageDown" },
  { key: "Shift-PageUp", command: "cursor.selectPageUp" },
  { key: "Ctrl-Space", command: "completion.start" },
  // Lists, tables and code
  { key: "Mod-l", command: "list.toggleTask" },
  { key: "Shift-Alt-f", command: "table.align" },
  // Ctrl+Enter keeps its base meaning (blank line below) outside tables.
  { key: "Mod-Enter", command: "table.insertRowBelow" },
  { key: "Mod-Shift-Enter", command: "table.insertRowAbove" },
  { key: "Shift-Alt-ArrowLeft", command: "table.moveColumnLeft" },
  { key: "Shift-Alt-ArrowRight", command: "table.moveColumnRight" },
  { key: "Shift-Alt-l", command: "code.detectLanguage" },
  // Editing
  { key: "Mod-z", command: "edit.undo" },
  { key: "Mod-y", command: "edit.redo" },
  { key: "Mod-Shift-z", command: "edit.redo" },
  { key: "Mod-a", command: "edit.selectAll" },
  // Escape dismisses the quickbar, then closes search, then collapses the
  // selection (the search panel's own Escape binding is scoped and kept).
  { key: "Escape", command: "edit.escape" },
  // View (registered by app/session.ts)
  { key: "Mod-Shift-l", command: "view.toggleSidebar" },
  // Search
  { key: "Mod-f", command: "search.find" },
  { key: "Mod-h", command: "search.replace" },
  { key: "F3", command: "search.next" },
  { key: "Shift-F3", command: "search.previous" },
  // File and window (registered by app/session.ts)
  { key: "Mod-s", command: "file.save" },
  { key: "Mod-Shift-s", command: "file.saveAs" },
  { key: "Mod-o", command: "file.open" },
  { key: "Mod-n", command: "file.new" },
  { key: "Mod-Shift-n", command: "file.newWindow" },
];

/** Base CodeMirror bindings we do not want: multi-cursor and conflicts. */
const DROPPED_BASE_KEYS = new Set(["Mod-d", "Mod-Alt-ArrowUp", "Mod-Alt-ArrowDown", "Mod-Shift-l"]);

function normalize(key: string): string {
  return key.toLowerCase();
}

/**
 * A base binding that also runs in a scope other than the editor (the
 * search panel's inputs) is kept even when our table binds the same key:
 * ours runs first in the editor, theirs keeps working in the panel.
 */
function hasOtherScope(binding: KeyBinding): boolean {
  return (binding.scope ?? "editor").split(" ").some((scope) => scope !== "editor");
}

/** CodeMirror's default, history and search bindings minus what we override. */
export function baseBindings(): KeyBinding[] {
  const ours = new Set(shortcuts.map((s) => normalize(s.key)));
  const keep = (binding: KeyBinding): boolean => {
    const names = [binding.key, binding.mac, binding.win, binding.linux].filter(
      (k): k is string => typeof k === "string",
    );
    return names.every(
      (k) =>
        (!ours.has(normalize(k)) || hasOtherScope(binding)) &&
        !DROPPED_BASE_KEYS.has(k) &&
        !FORBIDDEN_KEYS.some((f) => k.includes(f)),
    );
  };
  return [...defaultKeymap, ...historyKeymap, ...searchKeymap].filter(keep);
}

/** Human-readable form of a CodeMirror key name (`Mod-Shift-x` -> `Ctrl+Shift+X`). */
export function formatKey(key: string): string {
  return key
    .split("-")
    .map((part) => {
      switch (part) {
        case "Mod":
          return isMac() ? "Cmd" : "Ctrl";
        case "ArrowUp":
          return "Up";
        case "ArrowDown":
          return "Down";
        case "ArrowLeft":
          return "Left";
        case "ArrowRight":
          return "Right";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join("+");
}

/** The label of the first shortcut bound to `command`, or `null`. */
export function shortcutLabel(command: string): string | null {
  const shortcut = shortcuts.find((s) => s.command === command);
  if (!shortcut) {
    return null;
  }
  return shortcut.label ?? formatKey(shortcut.key);
}

/** The keymap extension: our table first, then the filtered base. */
export function buildKeymap(): Extension {
  const ours: KeyBinding[] = shortcuts.map((s) => ({
    key: s.key,
    run: (view) => runCommand(s.command, view),
  }));
  return [keymap.of(ours), keymap.of(baseBindings())];
}
