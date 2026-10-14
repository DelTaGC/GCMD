// Writes an updater manifest (latest.json) for the signed bundles of a local
// `tauri build --config src-tauri/tauri.release.conf.json` (ADR 0010).
// GitHub releases get theirs from tauri-action; this is for testing updates
// locally and for hosting releases elsewhere.
//   node tools/release/manifest.mjs --base-url http://localhost:8765 --out-dir <dir> [--notes "..."]
// Copies each signed bundle into --out-dir and writes <out-dir>/latest.json
// whose URLs are <base-url>/<file name>.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundleDir = join(root, "src-tauri", "target", "release", "bundle");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  console.error(`missing ${name}`);
  process.exit(1);
}

const baseUrl = arg("--base-url").replace(/\/$/, "");
const outDir = arg("--out-dir");
const notes = arg("--notes", "");
// --version only for test builds whose version came from a config overlay.
const version = arg(
  "--version",
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
);

function archOf(name) {
  if (/aarch64|arm64/.test(name)) return "aarch64";
  if (/universal/.test(name)) return "universal";
  return "x86_64";
}

// [bundle subdirectory, file suffix, platform keys for a file name]
const KINDS = [
  ["nsis", "-setup.exe", (n) => [`windows-${archOf(n)}`, `windows-${archOf(n)}-nsis`]],
  ["msi", ".msi", (n) => [`windows-${archOf(n)}-msi`]],
  [
    "macos",
    ".app.tar.gz",
    (n) =>
      archOf(n) === "universal"
        ? ["darwin-x86_64", "darwin-aarch64"]
        : [`darwin-${archOf(n)}`, `darwin-${archOf(n)}-app`],
  ],
  ["appimage", ".AppImage", (n) => [`linux-${archOf(n)}`, `linux-${archOf(n)}-appimage`]],
  ["deb", ".deb", (n) => [`linux-${archOf(n)}-deb`]],
];

const platforms = {};
mkdirSync(outDir, { recursive: true });
for (const [sub, suffix, keys] of KINDS) {
  const dir = join(bundleDir, sub);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(suffix) || !name.includes(`_${version}_`)) continue;
    const sigPath = join(dir, `${name}.sig`);
    if (!existsSync(sigPath)) {
      console.error(`${name}: no .sig (build with --config src-tauri/tauri.release.conf.json)`);
      process.exit(1);
    }
    copyFileSync(join(dir, name), join(outDir, name));
    const entry = {
      signature: readFileSync(sigPath, "utf8").trim(),
      url: `${baseUrl}/${encodeURIComponent(basename(name))}`,
    };
    for (const key of keys(name)) platforms[key] = entry;
  }
}

if (Object.keys(platforms).length === 0) {
  console.error(`no signed ${version} bundles under ${bundleDir}`);
  process.exit(1);
}
const manifest = { version, notes, pub_date: new Date().toISOString(), platforms };
writeFileSync(join(outDir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json for ${version}: ${Object.keys(platforms).join(", ")}`);
