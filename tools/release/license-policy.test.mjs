import { describe, expect, it } from "vitest";
import {
  chosenLicenses,
  fileNameLicense,
  filesForLicenses,
  licenseProblem,
  parseExpression,
} from "./license-policy.mjs";

describe("parseExpression", () => {
  it("parses precedence, parentheses and exceptions", () => {
    expect(parseExpression("(MIT OR Apache-2.0) AND Unicode-3.0")).toEqual({
      type: "and",
      items: [
        {
          type: "or",
          items: [
            { type: "license", id: "MIT", exception: null },
            { type: "license", id: "Apache-2.0", exception: null },
          ],
        },
        { type: "license", id: "Unicode-3.0", exception: null },
      ],
    });
    expect(parseExpression("MIT OR Apache-2.0 WITH LLVM-exception")).toEqual({
      type: "or",
      items: [
        { type: "license", id: "MIT", exception: null },
        { type: "license", id: "Apache-2.0", exception: "LLVM-exception" },
      ],
    });
    // AND binds tighter than OR.
    expect(parseExpression("MIT OR ISC AND Zlib").type).toBe("or");
  });

  it("reads the legacy slash form and lower-case operators", () => {
    expect(parseExpression("MIT/Apache-2.0")).toEqual(parseExpression("MIT OR Apache-2.0"));
    expect(parseExpression("mit or isc")).toEqual({
      type: "or",
      items: [
        { type: "license", id: "mit", exception: null },
        { type: "license", id: "isc", exception: null },
      ],
    });
  });

  it("rejects malformed expressions", () => {
    for (const bad of ["", "MIT OR", "(MIT", "MIT)", "MIT Apache-2.0", "AND MIT", "MIT WITH"]) {
      expect(() => parseExpression(bad), bad).toThrow(/license expression/);
    }
  });
});

describe("licenseProblem", () => {
  it("accepts allowed licenses and combinations", () => {
    for (const ok of [
      "MIT",
      "ISC",
      "0BSD",
      "BSD-2-Clause",
      "BSD-3-Clause AND MIT",
      "Unicode-3.0",
      "(MIT OR Apache-2.0) AND Unicode-3.0",
      "Apache-2.0 AND ISC",
      "Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT",
      "(MPL-2.0 OR Apache-2.0)",
      "CC0-1.0 OR MIT-0 OR Apache-2.0",
      "Unlicense/MIT",
      "Zlib",
    ]) {
      expect(licenseProblem(ok), ok).toBeNull();
    }
  });

  it("accepts an OR with a single allowed option", () => {
    expect(licenseProblem("EPL-2.0 OR MIT")).toBeNull();
    expect(licenseProblem("MIT OR Apache-2.0 OR LGPL-2.1-or-later")).toBeNull();
  });

  it("rejects disallowed licenses, also inside AND", () => {
    for (const bad of [
      "EPL-2.0",
      "GPL-2.0-only",
      "LGPL-3.0 OR EPL-2.0",
      "MIT AND EPL-2.0",
      "(MIT OR Apache-2.0) AND CDDL-1.0",
      "MIT WITH Classpath-exception-2.0",
      "SEE LICENSE IN LICENSE.txt",
    ]) {
      expect(licenseProblem(bad), bad).toMatch(/not allowed|license expression/);
    }
  });

  it("rejects a missing license", () => {
    expect(licenseProblem(undefined)).toBe("no license");
    expect(licenseProblem(null)).toBe("no license");
    expect(licenseProblem("  ")).toBe("no license");
  });

  it("uses the allow-list it is given", () => {
    expect(licenseProblem("MIT", new Set(["ISC"]))).toMatch(/not allowed/);
  });
});

describe("chosenLicenses", () => {
  const preference = ["MIT", "BSD-3-Clause", "MPL-2.0"];
  const choose = (expression) => chosenLicenses(parseExpression(expression), preference);

  it("prefers the earliest option in the preference list", () => {
    expect(choose("Zlib OR Apache-2.0 OR MIT")).toEqual(["MIT"]);
    expect(choose("MPL-2.0 OR BSD-3-Clause")).toEqual(["BSD-3-Clause"]);
  });

  it("falls back to the first allowed option", () => {
    expect(choose("EPL-2.0 OR Zlib OR ISC")).toEqual(["Zlib"]);
  });

  it("keeps every part of an AND", () => {
    expect(choose("(Apache-2.0 OR MIT) AND Unicode-3.0")).toEqual(["MIT", "Unicode-3.0"]);
  });
});

describe("fileNameLicense", () => {
  it("reads the license a file name points to", () => {
    expect(fileNameLicense("LICENSE-MIT")).toBe("MIT");
    expect(fileNameLicense("LICENSE-MIT.md")).toBe("MIT");
    expect(fileNameLicense("MIT-LICENSE.txt")).toBe("MIT");
    expect(fileNameLicense("LICENSE-APACHE")).toBe("Apache-");
    expect(fileNameLicense("LICENSE.apache2")).toBe("Apache-");
    expect(fileNameLicense("LICENSE-ZLIB.md")).toBe("Zlib");
    expect(fileNameLicense("UNLICENSE")).toBe("Unlicense");
    expect(fileNameLicense("LICENSE-MPL")).toBe("MPL-");
    expect(fileNameLicense("LICENSE-UNICODE")).toBe("Unicode-");
  });

  it("returns null for generic names", () => {
    for (const name of ["LICENSE", "license.md", "LICENCE.txt", "COPYING", "NOTICE", "COPYRIGHT"]) {
      expect(fileNameLicense(name), name).toBeNull();
    }
    // "mit" must be a whole word.
    expect(fileNameLicense("LICENSE-SUBMIT")).toBeNull();
  });
});

describe("filesForLicenses", () => {
  const files = (...names) => names.map((name) => ({ name, text: name }));
  const names = (list) => list.map((f) => f.name);

  it("drops the files of OR options that are not used", () => {
    expect(
      names(filesForLicenses(files("LICENSE-APACHE", "LICENSE-MIT", "NOTICE"), ["MIT"])),
    ).toEqual(["LICENSE-MIT", "NOTICE"]);
    expect(
      names(
        filesForLicenses(files("LICENSE-APACHE", "LICENSE-MIT", "LICENSE-UNICODE"), [
          "MIT",
          "Unicode-3.0",
        ]),
      ),
    ).toEqual(["LICENSE-MIT", "LICENSE-UNICODE"]);
    // dompurify: LICENSE is the Apache text, used under Apache-2.0.
    expect(names(filesForLicenses(files("LICENSE", "LICENSE-MPL"), ["Apache-2.0"]))).toEqual([
      "LICENSE",
    ]);
  });

  it("keeps everything rather than nothing", () => {
    expect(names(filesForLicenses(files("LICENSE-APACHE"), ["MIT"]))).toEqual(["LICENSE-APACHE"]);
  });
});
