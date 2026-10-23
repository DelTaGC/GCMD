import { describe, expect, it } from "vitest";
import { canonicalKey, effectiveShortcuts, type Shortcut } from "./keymap";
import { assignKey, isCustomized, removeKey, resetCommand } from "./keymapEdit";
import { keyNameFromPress, keyProblem, type KeyPress } from "./keyRecord";

const defaults: Shortcut[] = [
  { key: "Mod-b", command: "format.strong" },
  { key: "Mod-i", command: "format.emphasis" },
  { key: "Mod-y", command: "edit.redo" },
  { key: "Mod-Shift-z", command: "edit.redo" },
];

const keys = (table: readonly Shortcut[], command: string): string[] =>
  table.filter((s) => s.command === command).map((s) => s.key);

describe("canonicalKey", () => {
  it("orders modifiers and lowercases one-character keys", () => {
    expect(canonicalKey("Shift-Alt-F")).toBe("Alt-Shift-f");
    expect(canonicalKey("Alt-Shift-f")).toBe("Alt-Shift-f");
    expect(canonicalKey("Mod--")).toBe("Mod--");
    expect(canonicalKey("Cmd-k")).toBe("Meta-k");
  });
});

describe("effectiveShortcuts", () => {
  it("replaces the keys of overridden commands and unbinds with []", () => {
    const table = effectiveShortcuts(
      { "format.strong": ["Mod-Shift-b"], "edit.redo": [] },
      defaults,
    );
    expect(keys(table, "format.strong")).toEqual(["Mod-Shift-b"]);
    expect(keys(table, "edit.redo")).toEqual([]);
    expect(keys(table, "format.emphasis")).toEqual(["Mod-i"]);
  });

  it("drops a default key that an override took", () => {
    const table = effectiveShortcuts({ "format.strong": ["Mod-i"] }, defaults);
    expect(keys(table, "format.emphasis")).toEqual([]);
  });
});

describe("keymap edits", () => {
  it("assigns a key and takes it from its previous command", () => {
    const edit = assignKey({}, "format.strong", "Mod-i", defaults);
    expect(edit.removedFrom).toEqual(["format.emphasis"]);
    const table = effectiveShortcuts(edit.overrides, defaults);
    expect(keys(table, "format.strong")).toEqual(["Mod-b", "Mod-i"]);
    expect(keys(table, "format.emphasis")).toEqual([]);
  });

  it("treats modifier order as the same key", () => {
    const edit = assignKey(
      { "format.strong": ["Shift-Alt-b"] },
      "format.strong",
      "Alt-Shift-b",
      defaults,
    );
    expect(edit.overrides).toEqual({ "format.strong": ["Shift-Alt-b"] });
  });

  it("removes a key and resets a command", () => {
    const removed = removeKey({}, "edit.redo", "Mod-y", defaults);
    expect(removed).toEqual({ "edit.redo": ["Mod-Shift-z"] });
    expect(isCustomized(removed, "edit.redo", defaults)).toBe(true);
    expect(resetCommand(removed, "edit.redo", defaults)).toEqual({});
  });

  it("keeps no override that restates the defaults", () => {
    const moved = assignKey({}, "format.strong", "Mod-Shift-b", defaults).overrides;
    const back = removeKey(moved, "format.strong", "Mod-Shift-b", defaults);
    expect(back).toEqual({});
    expect(isCustomized(back, "format.strong", defaults)).toBe(false);
  });
});

const press = (key: string, code: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("keyNameFromPress", () => {
  it("names Ctrl combinations with Mod on Windows and Linux", () => {
    expect(keyNameFromPress(press("B", "KeyB", { ctrlKey: true, shiftKey: true }), false)).toBe(
      "Mod-Shift-b",
    );
    expect(keyNameFromPress(press("ArrowUp", "ArrowUp", { altKey: true }), false)).toBe(
      "Alt-ArrowUp",
    );
    expect(keyNameFromPress(press("F5", "F5"), false)).toBe("F5");
  });

  it("names digits by their physical key when Shift changes the character", () => {
    expect(keyNameFromPress(press("+", "Digit1", { ctrlKey: true, shiftKey: true }), false)).toBe(
      "Mod-Shift-1",
    );
  });

  it("uses Cmd as Mod on macOS and ignores bare modifiers", () => {
    expect(keyNameFromPress(press("k", "KeyK", { metaKey: true }), true)).toBe("Mod-k");
    expect(keyNameFromPress(press("Control", "ControlLeft", { ctrlKey: true }), false)).toBeNull();
    expect(keyNameFromPress(press("Dead", "Equal"), false)).toBeNull();
  });
});

describe("keyProblem", () => {
  it("refuses dead keys, AltGr and bare printable keys", () => {
    expect(keyProblem("Mod-^", false)).not.toBeNull();
    expect(keyProblem("Mod-Alt-e", false)).not.toBeNull();
    expect(keyProblem("Mod-Alt-e", true)).toBeNull();
    expect(keyProblem("x", false)).not.toBeNull();
    expect(keyProblem("Shift-x", false)).not.toBeNull();
  });

  it("accepts modified keys and bare function keys", () => {
    expect(keyProblem("Mod-Shift-b", false)).toBeNull();
    expect(keyProblem("F7", false)).toBeNull();
    expect(keyProblem("Alt-ArrowUp", false)).toBeNull();
  });
});
