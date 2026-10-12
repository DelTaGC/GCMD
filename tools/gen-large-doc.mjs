// Generates tests/fixtures/generated/large.md, a ~1 MB / ~20k-line document
// that exercises every GFM element GCMD renders. Used for the performance
// budgets in CLAUDE.md. Output is gitignored; regenerate with:
//   npm run fixtures:large [-- --mb 1]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "tests", "fixtures", "generated");
const mbArg = process.argv.indexOf("--mb");
const targetBytes = (mbArg === -1 ? 1 : Number(process.argv[mbArg + 1])) * 1024 * 1024;

// Deterministic pseudo-random so the fixture is reproducible.
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}
const words =
  "markdown editor lightweight document heading paragraph emphasis strong code table task diagram render buffer selection cursor widget parser".split(
    " ",
  );
function sentence(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(words[Math.floor(rand() * words.length)]);
  return out.join(" ");
}

function section(index) {
  const parts = [];
  parts.push(`## Section ${index}: ${sentence(3)}\n`);
  parts.push(
    `${sentence(25)} **${sentence(2)}** and *${sentence(2)}* with \`inline code\` and ~~${sentence(1)}~~.\n`,
  );
  parts.push(`See https://example.com/${index} and [a link](https://example.com/page/${index}).\n`);
  parts.push(`### Tasks\n`);
  for (let i = 0; i < 4; i++) parts.push(`- [${rand() > 0.5 ? "x" : " "}] ${sentence(4)}`);
  parts.push("");
  parts.push(`> ${sentence(12)}\n`);
  parts.push("| Column A | Column B | Column C |\n| --- | :---: | ---: |");
  for (let i = 0; i < 3; i++) parts.push(`| ${sentence(1)} | ${sentence(2)} | ${index * 7 + i} |`);
  parts.push("");
  parts.push("```ts");
  parts.push(`export function f${index}(x: number): number {\n  return x * ${index};\n}`);
  parts.push("```\n");
  if (index % 50 === 0) {
    parts.push(
      "```mermaid\ngraph TD\n  A[Start] --> B{Decision}\n  B -->|yes| C[Done]\n  B -->|no| A\n```\n",
    );
  }
  parts.push("1. first\n2. second\n   - nested\n   - nested again\n");
  parts.push("---\n");
  return parts.join("\n");
}

let body =
  "# Large generated document\n\nUsed for performance measurements. Do not edit by hand.\n\n";
let i = 1;
while (Buffer.byteLength(body) < targetBytes) {
  body += section(i++);
}

mkdirSync(outDir, { recursive: true });
const out = join(outDir, "large.md");
writeFileSync(out, body);
console.log(
  `wrote ${out}: ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(2)} MB, ${body.split("\n").length} lines, ${i - 1} sections`,
);
