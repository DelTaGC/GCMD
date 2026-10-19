import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listCommands } from "./commands";
import { FORBIDDEN_KEYS, baseBindings, formatKey, shortcutLabel, shortcuts } from "./keymap";

describe("shortcut table", () => {
  it("never binds dead keys of the Swiss-French layout", () => {
    for (const s of shortcuts) {
      for (const f of FORBIDDEN_KEYS) {
        expect(s.key, `${s.key} -> ${s.command}`).not.toContain(f);
      }
    }
  });

  it("binds inline code to Ctrl+E and duplicate line to Ctrl+D", () => {
    expect(shortcuts.find((s) => s.key === "Mod-e")?.command).toBe("format.inlineCode");
    expect(shortcuts.find((s) => s.key === "Mod-d")?.command).toBe("line.duplicate");
  });

  it("has no duplicate keys", () => {
    const keys = shortcuts.map((s) => s.key.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only references registered editor commands or file/view commands", () => {
    const known = new Set(listCommands().map((c) => c.id));
    for (const s of shortcuts) {
      const ok = known.has(s.command) || /^(file|view|help)\./.test(s.command);
      expect(ok, s.command).toBe(true);
    }
  });
});

describe("baseBindings", () => {
  it("drops multi-cursor and overridden bindings", () => {
    const keys = new Set(baseBindings().map((b) => b.key));
    expect(keys.has("Mod-d")).toBe(false);
    expect(keys.has("Mod-i")).toBe(false);
    expect(keys.has("Mod-Alt-ArrowUp")).toBe(false);
    expect(keys.has("Mod-Shift-l")).toBe(false);
  });

  it("keeps ordinary movement bindings", () => {
    const keys = new Set(baseBindings().map((b) => b.key));
    expect(keys.has("ArrowLeft")).toBe(true);
    expect(keys.has("Mod-Home")).toBe(true);
  });

  it("keeps the search panel's scoped Escape while dropping the editor-only one", () => {
    const escapes = baseBindings().filter((b) => b.key === "Escape");
    expect(escapes.length).toBeGreaterThan(0);
    for (const binding of escapes) {
      expect(binding.scope ?? "editor").not.toBe("editor");
    }
  });
});

describe("native menu accelerators", () => {
  // Every accelerator in src-tauri/src/menu.rs must match the shortcut table
  // for the same command id, so menus show the keys that actually work.
  const source = readFileSync(new URL("../../src-tauri/src/menu.rs", import.meta.url), "utf8");
  const pattern =
    /"([a-z]+\.[A-Za-z0-9]+)",\s*"[^"]*",\s*(?:true,\s*(?:[a-z._]+,\s*)?)?Some\("([^"]+)"\)/g;
  const accelerators = new Map<string, string>();
  for (const match of source.matchAll(pattern)) {
    accelerators.set(match[1] ?? "", match[2] ?? "");
  }

  function toKeyName(accelerator: string): string {
    return accelerator
      .split("+")
      .map((part) => {
        switch (part) {
          case "CmdOrCtrl":
            return "Mod";
          case "Up":
          case "Down":
          case "Left":
          case "Right":
            return `Arrow${part}`;
          default:
            return part.length === 1 ? part.toLowerCase() : part;
        }
      })
      .join("-")
      .toLowerCase();
  }

  it("finds the menu accelerators", () => {
    expect(accelerators.size).toBeGreaterThan(10);
    expect(accelerators.get("file.save")).toBe("CmdOrCtrl+S");
  });

  it("match the shortcut table", () => {
    for (const [command, accelerator] of accelerators) {
      const bound = shortcuts.find((s) => s.command === command);
      expect(bound, `${command} has a menu accelerator but no shortcut`).toBeDefined();
      expect(toKeyName(accelerator), command).toBe(bound?.key.toLowerCase());
    }
  });

  it("never list undo, redo or select all (the search panel needs those keys)", () => {
    for (const id of ["edit.undo", "edit.redo", "edit.selectAll"]) {
      expect(accelerators.has(id), id).toBe(false);
    }
  });
});

describe("formatKey", () => {
  it("spells keys the way menus do", () => {
    expect(formatKey("Mod-Shift-x")).toMatch(/^(Ctrl|Cmd)\+Shift\+X$/);
    expect(formatKey("Alt-ArrowUp")).toBe("Alt+Up");
    expect(formatKey("F3")).toBe("F3");
    expect(formatKey("Mod--")).toMatch(/^(Ctrl|Cmd)\+-$/);
    expect(shortcutLabel("view.zoom.in")).toMatch(/^(Ctrl|Cmd)\+\+$/);
    expect(shortcutLabel("format.strong")).toMatch(/^(Ctrl|Cmd)\+B$/);
    expect(shortcutLabel("format.clearFormatting")).toBeNull();
  });
});
