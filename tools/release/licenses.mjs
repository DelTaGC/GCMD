// Writes THIRD-PARTY-NOTICES.md: name, version, license and license texts of
// every third-party package GCMD ships (ADR 0011). Bundled next to the
// executable (`bundle.resources`) and named in Help > About.
//   node tools/release/licenses.mjs               write the file
//   node tools/release/licenses.mjs --check       fail if it is out of date (part of npm run check)
// Packages: the npm runtime closure (`npm ls --omit=dev`) and the Rust crates
// reachable from `gcmd` through normal dependencies on Windows, macOS and
// Linux (`cargo metadata --filter-platform`). Fails when a package has no
// license or one outside the allow-list in license-policy.mjs (or its
// PACKAGE_EXCEPTIONS entry, for packages under GCMD's additional permission).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowedFor,
  chosenLicenses,
  filesForLicenses,
  licenseProblem,
  PACKAGE_EXCEPTIONS,
  parseExpression,
} from "./license-policy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const OUT = "THIRD-PARTY-NOTICES.md";

// Licenses for packages whose metadata has no usable license field, set after
// reading their license file. Keyed by version so an update is re-checked.
const LICENSE_OVERRIDES = {
  "npm:khroma@2.1.0": "MIT", // no "license" in package.json; `license` is the MIT text
};

// Rust targets of the release bundles (.github/workflows/release.yml).
const PLATFORMS = {
  Windows: ["x86_64-pc-windows-msvc"],
  macOS: ["aarch64-apple-darwin", "x86_64-apple-darwin"],
  Linux: ["x86_64-unknown-linux-gnu"],
};

// The option GCMD uses of a dual-licensed package: the first of these. Only
// that option's license file is reproduced (and dompurify's
// `MPL-2.0 OR Apache-2.0` is used under Apache-2.0, as ADR 0011 says).
const PREFERENCE = [
  "MIT",
  "ISC",
  "BSD-3-Clause",
  "BSD-2-Clause",
  "0BSD",
  "Zlib",
  "Unlicense",
  "CC0-1.0",
  "Apache-2.0",
  "Apache-2.0 WITH LLVM-exception",
  "Unicode-3.0",
  "MPL-2.0",
];

const LICENSE_FILE = /^(?:licen[cs]e|copying|notice|copyright|unlicense)(?:[-._].*)?$/i;
const LICENSE_DIR = /^licen[cs]es$/i;
const NOT_A_TEXT = /\.(?:[cm]?js|ts|json|rs|html?)$/i;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");

const problems = [];

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function npmPackages() {
  // npm is a .cmd script on Windows, which only a shell can start.
  const result = run("npm ls --omit=dev --all --json --long", [], { shell: true });
  if (!result.stdout.trim()) {
    throw new Error(`npm ls failed: ${result.stderr}`);
  }
  const packages = new Map();
  const walk = (node) => {
    for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
      const id = `${name}@${dep.version}`;
      if (dep.missing || dep.version === undefined) {
        problems.push(`npm ${name}: not installed (run npm ci)`);
        continue;
      }
      const known = packages.get(id);
      if (known === undefined) {
        packages.set(id, {
          ecosystem: "npm",
          name,
          version: dep.version,
          license: LICENSE_OVERRIDES[`npm:${id}`] ?? npmLicense(dep),
          dir: dep.path,
          authors: npmAuthors(dep),
          extraFiles: [],
          platforms: null,
        });
      } else if (known.dir === undefined) {
        known.dir = dep.path;
      }
      walk(dep);
    }
  };
  walk(JSON.parse(result.stdout));
  return [...packages.values()];
}

function npmLicense(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (typeof pkg.license?.type === "string") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  return null;
}

function npmAuthors(pkg) {
  const author = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
  return author ? [author] : [];
}

function cratePackages() {
  const crates = new Map();
  for (const [platform, targets] of Object.entries(PLATFORMS)) {
    for (const target of targets) {
      const result = run("cargo", [
        "metadata",
        "--format-version",
        "1",
        "--locked",
        "--manifest-path",
        join("src-tauri", "Cargo.toml"),
        "--filter-platform",
        target,
      ]);
      if (result.status !== 0) throw new Error(`cargo metadata failed: ${result.stderr}`);
      const meta = JSON.parse(result.stdout);
      const byId = new Map(meta.packages.map((p) => [p.id, p]));
      const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
      const rootId = meta.resolve.root;
      // Normal dependencies only: build scripts and dev tools are not shipped.
      const reached = new Set([rootId]);
      const stack = [rootId];
      while (stack.length > 0) {
        for (const dep of nodes.get(stack.pop()).deps) {
          if (!dep.dep_kinds.some((k) => k.kind === null) || reached.has(dep.pkg)) continue;
          reached.add(dep.pkg);
          stack.push(dep.pkg);
        }
      }
      reached.delete(rootId);
      for (const id of reached) {
        const p = byId.get(id);
        const known = crates.get(id);
        if (known !== undefined) {
          known.platforms.add(platform);
          continue;
        }
        const dir = dirname(p.manifest_path);
        crates.set(id, {
          ecosystem: "cargo",
          name: p.name,
          version: p.version,
          license: LICENSE_OVERRIDES[`cargo:${p.name}@${p.version}`] ?? p.license,
          dir,
          authors: p.authors.map((a) => a.replace(/\s*<[^>]*>/, "").trim()).filter(Boolean),
          extraFiles: p.license_file ? [join(dir, p.license_file)] : [],
          platforms: new Set([platform]),
        });
      }
    }
  }
  return [...crates.values()];
}

function normalize(text) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/** The package's own license, notice and copyright files. */
function licenseFiles(pkg) {
  const paths = [];
  for (const entry of readdirSync(pkg.dir, { withFileTypes: true })) {
    const full = join(pkg.dir, entry.name);
    if (entry.isFile() && LICENSE_FILE.test(entry.name) && !NOT_A_TEXT.test(entry.name)) {
      paths.push(full);
    } else if (entry.isDirectory() && LICENSE_DIR.test(entry.name)) {
      for (const inner of readdirSync(full)) paths.push(join(full, inner));
    }
  }
  for (const extra of pkg.extraFiles) {
    if (existsSync(extra) && !paths.includes(extra)) paths.push(extra);
  }
  return paths
    .filter((p) => statSync(p).isFile())
    .map((p) => ({
      name: relative(pkg.dir, p).replace(/\\/g, "/"),
      text: normalize(readFileSync(p, "utf8")),
    }))
    .filter((f) => f.text !== "")
    .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
}

/**
 * For a package that ships no license file: the standard text
 * (license-texts/<id>.txt) of each license used, with its authors as the
 * copyright holders.
 */
function standardTexts(pkg, chosen) {
  const holders = pkg.authors.length > 0 ? pkg.authors.join(", ") : `the ${pkg.name} authors`;
  return chosen.map((key) => {
    const id = key.split(" WITH ")[0];
    const template = join(here, "license-texts", `${id}.txt`);
    if (!existsSync(template)) {
      problems.push(
        `${label(pkg)}: no license file, and no standard ${id} text in tools/release/license-texts/`,
      );
      return { name: `${id} (missing)`, text: "" };
    }
    const text = readFileSync(template, "utf8").replace(
      "{{copyright}}",
      `Copyright (c) ${holders}`,
    );
    return { name: `standard ${id} text`, text: normalize(text) };
  });
}

function label(pkg) {
  return `${pkg.ecosystem === "npm" ? "npm" : "crate"} ${pkg.name} ${pkg.version}`;
}

// Longer than any tilde run starting a line of the text.
function fenceFor(text) {
  const longest = Math.max(0, ...[...text.matchAll(/^~+/gm)].map((m) => m[0].length));
  return "~".repeat(Math.max(3, longest + 1));
}

const cell = (s) => String(s).replace(/\|/g, "\\|");

function render(npm, crates) {
  const groups = new Map(); // whitespace-insensitive text -> { number, text, users }
  const notices = new Map(); // package -> text numbers
  for (const pkg of [...npm, ...crates]) {
    const numbers = [];
    for (const file of pkg.texts) {
      const key = file.text.replace(/\s+/g, " ");
      let group = groups.get(key);
      if (group === undefined) {
        group = { number: groups.size + 1, text: file.text, users: [] };
        groups.set(key, group);
      }
      const user = `${pkg.name} ${pkg.version}`;
      if (!group.users.includes(user)) group.users.push(user);
      if (!numbers.includes(group.number)) numbers.push(group.number);
    }
    notices.set(pkg, numbers.map((n) => `[${n}](#text-${n})`).join(", "));
  }

  const lines = [
    "# Third-party notices",
    "",
    "GCMD is free software under the GNU General Public License, version 3 or",
    "later, with an additional permission for elkjs: the `LICENSE` and",
    "`LICENSE-EXCEPTION` files of the source, `LICENSE.txt` and",
    "`LICENSE-EXCEPTION.txt` next to this file in an installed copy. It",
    "contains the third-party packages listed below, each under its own",
    "license. Their copyright and license notices follow the lists;",
    "identical texts are printed once.",
    "",
    "Generated by `tools/release/licenses.mjs` (`npm run licenses`) from",
    "`package-lock.json` and `src-tauri/Cargo.lock`. Do not edit by hand.",
    "",
    `## npm packages (user interface, ${npm.length})`,
    "",
    "| Package | Version | License | Notices |",
    "| --- | --- | --- | --- |",
    ...npm.map(
      (p) => `| ${cell(p.name)} | ${p.version} | ${cell(p.license)} | ${notices.get(p)} |`,
    ),
    "",
    `## Rust crates (application binary, ${crates.length})`,
    "",
    "| Crate | Version | License | Platforms | Notices |",
    "| --- | --- | --- | --- | --- |",
    ...crates.map(
      (p) =>
        `| ${cell(p.name)} | ${p.version} | ${cell(p.license)} | ${Object.keys(PLATFORMS)
          .filter((name) => p.platforms.has(name))
          .join(", ")} | ${notices.get(p)} |`,
    ),
    "",
  ];
  const excepted = [...npm, ...crates].filter((p) => exceptionOf(p) !== undefined);
  if (excepted.length > 0) {
    lines.push(
      "## Under the additional permission",
      "",
      "Not GPL-compatible by themselves; GCMD's license permits combining with",
      "them (`LICENSE-EXCEPTION`). Their source code:",
      "",
    );
    for (const p of excepted) {
      const source = exceptionOf(p).source.replace("{version}", p.version);
      lines.push(`- ${p.name} ${p.version} (${p.license}): ${source}.`);
    }
    lines.push("");
  }
  lines.push("## License texts", "");
  for (const group of groups.values()) {
    const fence = fenceFor(group.text);
    lines.push(
      `### Text ${group.number}`,
      "",
      `Used by: ${group.users.join(", ")}.`,
      "",
      `${fence}text`,
      group.text,
      fence,
      "",
    );
  }
  return { markdown: `${lines.join("\n").trimEnd()}\n`, texts: groups.size };
}

const byName = (a, b) =>
  a.name === b.name ? (a.version < b.version ? -1 : 1) : a.name < b.name ? -1 : 1;

const exceptionOf = (pkg) => PACKAGE_EXCEPTIONS[`${pkg.ecosystem}:${pkg.name}`];

const npm = npmPackages();
const crates = cratePackages();
npm.sort(byName);
crates.sort(byName);

for (const pkg of [...npm, ...crates]) {
  const allowed = allowedFor(pkg.ecosystem, pkg.name);
  const problem = licenseProblem(pkg.license, allowed);
  if (problem !== null) {
    problems.push(`${label(pkg)}: ${problem}`);
    pkg.texts = [];
    continue;
  }
  if (pkg.dir === undefined || !existsSync(pkg.dir)) {
    problems.push(`${label(pkg)}: sources not found (npm ci / cargo fetch)`);
    pkg.texts = [];
    continue;
  }
  const files = licenseFiles(pkg);
  const chosen = chosenLicenses(parseExpression(pkg.license), PREFERENCE, allowed);
  pkg.texts = files.length > 0 ? filesForLicenses(files, chosen) : standardTexts(pkg, chosen);
}

if (problems.length > 0) {
  for (const p of problems) console.error(p);
  console.error(
    `${problems.length} license problem(s); see tools/release/license-policy.mjs (ADR 0011)`,
  );
  process.exit(1);
}

const { markdown, texts } = render(npm, crates);
const outPath = join(root, OUT);
const summary = `${npm.length} npm packages, ${crates.length} crates, ${texts} license texts, ${Math.round(markdown.length / 1024)} KB`;
if (checkOnly) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== markdown) {
    console.error(`${OUT} is out of date; run: npm run licenses`);
    process.exit(1);
  }
  console.log(`${OUT} up to date (${summary})`);
} else {
  writeFileSync(outPath, markdown);
  console.log(`${OUT}: ${summary}`);
}
