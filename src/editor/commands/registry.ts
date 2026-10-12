/**
 * The command registry (CLAUDE.md invariant 3).
 *
 * Every editing or application action is a named command. Menus, the
 * quickbar, keyboard shortcuts and future LLM hooks run commands by id;
 * nothing else mutates the editor.
 */
import type { EditorView } from "@codemirror/view";

/** Minimal target a command needs; `EditorView` satisfies it. */
export type CommandRunner = (view: EditorView) => boolean;

export interface CommandDef {
  /** Stable id, `area.name`, used by keymap, menu and IPC. */
  readonly id: string;
  /** Human-readable title for menus and the palette. */
  readonly title: string;
  readonly run: CommandRunner;
}

const registry = new Map<string, CommandDef>();

/** Registers a command; re-registering the same id replaces it. */
export function defineCommand(def: CommandDef): CommandDef {
  registry.set(def.id, def);
  return def;
}

export function getCommand(id: string): CommandDef | undefined {
  return registry.get(id);
}

/** Runs a command by id; unknown ids return false and log a warning. */
export function runCommand(id: string, view: EditorView): boolean {
  const def = registry.get(id);
  if (!def) {
    console.warn(`unknown command: ${id}`);
    return false;
  }
  return def.run(view);
}

export function listCommands(): CommandDef[] {
  return [...registry.values()];
}
