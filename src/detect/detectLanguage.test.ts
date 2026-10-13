import { describe, expect, it } from "vitest";
import { detectLanguage, type DetectedLanguage } from "./detectLanguage";

const positives: readonly (readonly [DetectedLanguage, string])[] = [
  [
    "JavaScript",
    "const add = (a, b) => a + b;\nconsole.log(add(1, 2));\nmodule.exports = { add };",
  ],
  ["TypeScript", "export function hello(name: string): string {\n  return `Hello, ${name}`;\n}"],
  ["Python", 'def hello(name: str) -> str:\n    return f"Hello, {name}"'],
  ["Rust", 'fn main() {\n    println!("Hello");\n}'],
  ["Go", 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hello")\n}'],
  [
    "Java",
    'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello");\n    }\n}',
  ],
  ["C", '#include <stdio.h>\n\nint main(void) {\n    printf("hello\\n");\n    return 0;\n}'],
  [
    "C++",
    '#include <iostream>\n\nint main() {\n    std::cout << "hello" << std::endl;\n    return 0;\n}',
  ],
  [
    "C#",
    'using System;\n\nnamespace Demo\n{\n    class Program\n    {\n        static void Main(string[] args)\n        {\n            Console.WriteLine("hello");\n        }\n    }\n}',
  ],
  ["HTML", '<!DOCTYPE html>\n<html>\n<body>\n  <div class="box">Hello</div>\n</body>\n</html>'],
  ["CSS", "body {\n  color: red;\n  margin: 0;\n}\n\n.box > p {\n  padding: 4px;\n}"],
  ["JSON", '{ "key": "value", "list": [1, 2, 3] }'],
  ["YAML", "name: demo\nversion: 1.0\nitems:\n  - alpha\n  - beta\nsettings:\n  debug: true"],
  ["TOML", '[package]\nname = "demo"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"'],
  ["Shell", '#!/usr/bin/env bash\nset -euo pipefail\necho "detect me"'],
  ["PowerShell", 'Write-Host "hi"\n$x = Get-ChildItem'],
  ["SQL", "SELECT id, name FROM users WHERE id = 1;"],
  [
    "Markdown",
    "# Title\n\n- [ ] todo\n- [x] done\n\nSome **bold** text and a [link](https://example.com).",
  ],
];

describe("detectLanguage", () => {
  it.each(positives)("detects %s", (language, code) => {
    expect(detectLanguage(code)).toBe(language);
  });

  it("covers every language in the union", () => {
    expect(new Set(positives.map(([language]) => language)).size).toBe(18);
  });

  describe("shebangs dominate", () => {
    it("python3", () => {
      expect(detectLanguage("#!/usr/bin/env python3\nprint(1)")).toBe("Python");
    });
    it("sh", () => {
      expect(detectLanguage("#!/bin/sh\nexit 0")).toBe("Shell");
    });
    it("node", () => {
      expect(detectLanguage("#!/usr/bin/env node\nprocess.exit(0);")).toBe("JavaScript");
    });
  });

  describe("related languages", () => {
    it("plain JavaScript stays JavaScript", () => {
      const code =
        "function greet(name) {\n  const msg = 'hi ' + name;\n  return msg === '' ? null : msg;\n}";
      expect(detectLanguage(code)).toBe("JavaScript");
    });
    it("interfaces and generics mean TypeScript", () => {
      const code =
        "interface User {\n  name: string;\n  tags: Array<string>;\n}\nexport type Id = number;";
      expect(detectLanguage(code)).toBe("TypeScript");
    });
    it("stdio is C", () => {
      expect(detectLanguage('#include <stdio.h>\nint main() { printf("x"); }')).toBe("C");
    });
    it("templates are C++", () => {
      expect(detectLanguage("template <typename T>\nclass Box {\n  T value;\n};")).toBe("C++");
    });
    it("Rust `use std::` is not C++", () => {
      expect(detectLanguage("use std::fs;\nfn main() {\n    let mut s = String::new();\n}")).toBe(
        "Rust",
      );
    });
    it("lowercase SQL", () => {
      expect(detectLanguage("select name from users\nwhere id = 2")).toBe("SQL");
    });
  });

  describe("returns null when unsure", () => {
    it.each([
      ["English prose", "This is a sentence about things. Another one."],
      [
        "multi-line prose with a colon",
        "Note: this is a longer paragraph.\nIt spans several lines and talks about nothing.\nPlease select an item from the list.",
      ],
      ["empty string", ""],
      ["whitespace only", "  \n\t\n"],
      ["a single short line", "hello"],
      ["a bare assignment", "x = 1"],
    ])("%s", (_name, code) => {
      expect(detectLanguage(code)).toBeNull();
    });
  });

  describe("input handling", () => {
    it("handles CRLF line endings", () => {
      expect(detectLanguage('fn main() {\r\n    println!("Hello");\r\n}')).toBe("Rust");
    });
    it("ignores everything after the first 60 lines", () => {
      const code = `${"\n".repeat(60)}fn main() {\n    println!("late");\n}`;
      expect(detectLanguage(code)).toBeNull();
    });
  });
});
