import { describe, expect, it } from "vitest";
import { listCommands } from "./commands";
import { FORBIDDEN_KEYS, baseBindings, shortcuts } from "./keymap";

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
});
