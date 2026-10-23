/**
 * Edits to the keymap overrides made by the keymap editor (settings panel).
 * Pure: each function takes the current overrides and returns new ones,
 * keeping only entries that differ from the defaults.
 */
import {
  canonicalKey,
  effectiveShortcuts,
  shortcuts,
  type KeymapOverrides,
  type Shortcut,
} from "./keymap";

export interface KeymapEdit {
  readonly overrides: KeymapOverrides;
  /** Commands that lost the key to this edit. */
  readonly removedFrom: readonly string[];
}

function keysOf(table: readonly Shortcut[], command: string): string[] {
  return table.filter((s) => s.command === command).map((s) => s.key);
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((k, i) => canonicalKey(k) === canonicalKey(b[i] ?? ""));
}

/** Drops overrides that restate the defaults. */
function tidy(
  overrides: Record<string, readonly string[]>,
  defaults: readonly Shortcut[],
): KeymapOverrides {
  const result: Record<string, readonly string[]> = {};
  for (const [command, keys] of Object.entries(overrides)) {
    if (!sameKeys(keys, keysOf(defaults, command))) {
      result[command] = keys;
    }
  }
  // A default restated after tidying may have lost its key to an override.
  const effective = effectiveShortcuts(result, defaults);
  for (const command of Object.keys(overrides)) {
    if (!(command in result) && !sameKeys(keysOf(effective, command), keysOf(defaults, command))) {
      result[command] = overrides[command] ?? [];
    }
  }
  return result;
}

/** Binds `key` to `command`, taking it away from any command that had it. */
export function assignKey(
  overrides: KeymapOverrides,
  command: string,
  key: string,
  defaults: readonly Shortcut[] = shortcuts,
): KeymapEdit {
  const table = effectiveShortcuts(overrides, defaults);
  const canonical = canonicalKey(key);
  const next: Record<string, readonly string[]> = { ...overrides };
  const removedFrom: string[] = [];
  for (const s of table) {
    if (s.command !== command && canonicalKey(s.key) === canonical) {
      removedFrom.push(s.command);
      next[s.command] = keysOf(table, s.command).filter((k) => canonicalKey(k) !== canonical);
    }
  }
  const current = keysOf(table, command);
  if (!current.some((k) => canonicalKey(k) === canonical)) {
    next[command] = [...current, key];
  }
  return { overrides: tidy(next, defaults), removedFrom };
}

/** Removes `key` from `command`. */
export function removeKey(
  overrides: KeymapOverrides,
  command: string,
  key: string,
  defaults: readonly Shortcut[] = shortcuts,
): KeymapOverrides {
  const table = effectiveShortcuts(overrides, defaults);
  const canonical = canonicalKey(key);
  const next = {
    ...overrides,
    [command]: keysOf(table, command).filter((k) => canonicalKey(k) !== canonical),
  };
  return tidy(next, defaults);
}

/** Gives `command` its default keys back. */
export function resetCommand(
  overrides: KeymapOverrides,
  command: string,
  defaults: readonly Shortcut[] = shortcuts,
): KeymapOverrides {
  const next = Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== command));
  return tidy(next, defaults);
}

/** Whether `command`'s keys differ from its defaults. */
export function isCustomized(
  overrides: KeymapOverrides,
  command: string,
  defaults: readonly Shortcut[] = shortcuts,
): boolean {
  return !sameKeys(
    keysOf(effectiveShortcuts(overrides, defaults), command),
    keysOf(defaults, command),
  );
}
