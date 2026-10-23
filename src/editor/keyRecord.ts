/**
 * Turning a key press into a CodeMirror key name for the keymap editor
 * (settings panel), and the rules a recorded key must follow. Pure: the
 * panel passes the relevant `KeyboardEvent` fields.
 */
import { FORBIDDEN_KEYS, canonicalKey } from "./keymap";

export interface KeyPress {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

/** Keys that are only modifiers or have no usable identity. */
const IGNORED = new Set([
  "Control",
  "Shift",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Dead",
  "Unidentified",
  "Process",
]);

/**
 * The CodeMirror key name for a press, or `null` while only modifiers are
 * held. `Mod` is Ctrl (Cmd on macOS). With Ctrl, Alt or Cmd held, a digit is
 * named from its physical key, as CodeMirror matches it (Shift+1 types `+`
 * on the Swiss-French layout).
 */
export function keyNameFromPress(press: KeyPress, mac: boolean): string | null {
  if (IGNORED.has(press.key)) {
    return null;
  }
  const commandLike = press.ctrlKey || press.altKey || press.metaKey;
  let base: string;
  const digit = /^Digit(\d)$/.exec(press.code);
  if (commandLike && digit) {
    base = digit[1] ?? press.key;
  } else if (press.key === " ") {
    base = "Space";
  } else if (press.key.length === 1) {
    base = press.key.toLowerCase();
  } else {
    base = press.key;
  }
  const mods: string[] = [];
  if (mac ? press.metaKey : press.ctrlKey) {
    mods.push("Mod");
  }
  if (mac && press.ctrlKey) {
    mods.push("Ctrl");
  }
  if (!mac && press.metaKey) {
    mods.push("Meta");
  }
  if (press.altKey) {
    mods.push("Alt");
  }
  if (press.shiftKey) {
    mods.push("Shift");
  }
  return canonicalKey([...mods, base].join("-"));
}

/** Keys that may be bound without a modifier. */
const BARE_OK =
  /^(F\d{1,2}|Escape|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right))$/;

/**
 * Why `key` cannot be bound, or `null` when it can. Refused: dead keys of
 * the Swiss-French layout, Ctrl+Alt on Windows and Linux (that is AltGr,
 * which types characters such as `@` and `#`), and printable keys without a
 * Ctrl/Alt/Cmd modifier (they would stop typing that character).
 */
export function keyProblem(key: string, mac: boolean): string | null {
  const parts = key.split(/-(?!$)/);
  const base = parts.pop() ?? "";
  const mods = new Set(parts);
  if (FORBIDDEN_KEYS.some((f) => base.includes(f))) {
    return "This is a dead key on the Swiss-French layout.";
  }
  if (!mac && mods.has("Mod") && mods.has("Alt")) {
    return "Ctrl+Alt is AltGr on this layout and types characters.";
  }
  const commandLike = mods.has("Mod") || mods.has("Ctrl") || mods.has("Alt") || mods.has("Meta");
  if (!commandLike && !BARE_OK.test(base)) {
    return "Add Ctrl or Alt: without them this key types text.";
  }
  return null;
}
