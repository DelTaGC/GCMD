// Keeps the app version identical everywhere it is written (ADR 0010).
// `tauri.conf.json` reads it from package.json; the others are set here.
//   node tools/release/version.mjs          check that all files agree (part of npm run check)
//   node tools/release/version.mjs 0.2.0    set the version everywhere
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = (rel) => join(root, rel);
const read = (rel) => readFileSync(file(rel), "utf8");

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// The [package] version line of Cargo.toml and the gcmd entry of Cargo.lock.
const CARGO_TOML = /^(\[package\][^[]*?\nversion = ")([^"]+)(")/m;
const CARGO_LOCK = /(\[\[package\]\]\nname = "gcmd"\nversion = ")([^"]+)(")/;

function current() {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  return {
    "package.json": pkg.version,
    "package-lock.json": lock.version,
    'package-lock.json packages[""]': lock.packages[""].version,
    "src-tauri/Cargo.toml": read("src-tauri/Cargo.toml").match(CARGO_TOML)?.[2],
    "src-tauri/Cargo.lock": read("src-tauri/Cargo.lock").match(CARGO_LOCK)?.[2],
    // Must point at package.json rather than repeat the number.
    "src-tauri/tauri.conf.json": conf.version === "../package.json" ? pkg.version : conf.version,
  };
}

function check() {
  const found = current();
  const expected = found["package.json"];
  const wrong = Object.entries(found).filter(([, v]) => v !== expected);
  if (wrong.length > 0) {
    for (const [where, v] of wrong) {
      console.error(`${where}: ${String(v)} (package.json says ${expected})`);
    }
    console.error("Run: node tools/release/version.mjs <version>");
    process.exit(1);
  }
  console.log(`version ${expected} consistent`);
}

function set(version) {
  if (!SEMVER.test(version)) {
    console.error(`not a semver version: ${version}`);
    process.exit(1);
  }
  const json = (rel, mutate) => {
    const data = JSON.parse(read(rel));
    mutate(data);
    writeFileSync(file(rel), `${JSON.stringify(data, null, 2)}\n`);
  };
  json("package.json", (d) => {
    d.version = version;
  });
  json("package-lock.json", (d) => {
    d.version = version;
    d.packages[""].version = version;
  });
  for (const [rel, pattern] of [
    ["src-tauri/Cargo.toml", CARGO_TOML],
    ["src-tauri/Cargo.lock", CARGO_LOCK],
  ]) {
    const text = read(rel);
    if (!pattern.test(text)) {
      console.error(`${rel}: version line not found`);
      process.exit(1);
    }
    writeFileSync(file(rel), text.replace(pattern, `$1${version}$3`));
  }
  check();
}

const arg = process.argv[2];
if (arg === undefined) {
  check();
} else {
  set(arg.replace(/^v/, ""));
}
