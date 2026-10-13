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
  // Tables and code
  { key: "Shift-Alt-f", command: "table.align" },
  { key: "Shift-Alt-l", command: "code.detectLanguage" },
  // Editing
  { key: "Mod-z", command: "edit.undo" },
  { key: "Mod-y", command: "edit.redo" },
  { key: "Mod-Shift-z", command: "edit.redo" },
  { key: "Mod-a", command: "edit.selectAll" },
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

/** CodeMirror's default, history and search bindings minus what we override. */
export function baseBindings(): KeyBinding[] {
  const ours = new Set(shortcuts.map((s) => normalize(s.key)));
  const keep = (binding: KeyBinding): boolean => {
    const names = [binding.key, binding.mac, binding.win, binding.linux].filter(
      (k): k is string => typeof k === "string",
    );
    return names.every(
      (k) =>
        !ours.has(normalize(k)) &&
        !DROPPED_BASE_KEYS.has(k) &&
        !FORBIDDEN_KEYS.some((f) => k.includes(f)),
    );
  };
  return [...defaultKeymap, ...historyKeymap, ...searchKeymap].filter(keep);
}

/** The keymap extension: our table first, then the filtered base. */
export function buildKeymap(): Extension {
  const ours: KeyBinding[] = shortcuts.map((s) => ({
    key: s.key,
    run: (view) => runCommand(s.command, view),
  }));
  return [keymap.of(ours), keymap.of(baseBindings())];
}
