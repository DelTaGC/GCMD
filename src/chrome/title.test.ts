import { describe, expect, it } from "vitest";
import { fileName, formatTitle } from "./title";

describe("title", () => {
  it("extracts the file name from Windows and POSIX paths", () => {
    expect(fileName("C:\\docs\\notes.md")).toBe("notes.md");
    expect(fileName("/home/me/notes.md")).toBe("notes.md");
    expect(fileName("notes.md")).toBe("notes.md");
    expect(fileName(null)).toBe("Untitled");
  });

  it("marks dirty documents with an asterisk", () => {
    expect(formatTitle("C:\\docs\\notes.md", false)).toBe("notes.md - GCMD");
    expect(formatTitle("C:\\docs\\notes.md", true)).toBe("notes.md* - GCMD");
    expect(formatTitle(null, true)).toBe("Untitled* - GCMD");
  });
});
