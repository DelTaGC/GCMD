// Prints the CHANGELOG.md section of a version (default: package.json's), the
// text used for the GitHub release body and the updater's release notes.
// Fails when the section is missing or empty, so a release cannot ship
// without notes.
//   node tools/release/notes.mjs [version]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const version =
  process.argv[2]?.replace(/^v/, "") ??
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

function sectionOf(changelog, wanted) {
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) =>
    new RegExp(`^## \\[?${wanted.replace(/\./g, "\\.")}\\]?(\\s|$)`).test(l),
  );
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

const body = sectionOf(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
if (!body) {
  console.error(`CHANGELOG.md has no notes under "## ${version}"`);
  process.exit(1);
}
console.log(body);
