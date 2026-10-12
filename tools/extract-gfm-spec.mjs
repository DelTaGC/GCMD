// Converts the GFM spec text (tests/fixtures/gfm/spec.txt, from
// github/cmark-gfm) into tests/fixtures/gfm/spec.json, the same shape the
// CommonMark reference `spec_tests.py --dump-tests` produces:
//   [{ markdown, html, example, start_line, end_line, section, extension }]
//
// Usage: node tools/extract-gfm-spec.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, "..", "tests", "fixtures", "gfm");
const input = join(specDir, "spec.txt");
const output = join(specDir, "spec.json");

const FENCE = "`".repeat(32);
const lines = readFileSync(input, "utf8").split("\n");

const examples = [];
let section = "";
let state = "outside"; // outside | markdown | html
let markdown = [];
let html = [];
let extension = "";
let startLine = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (state === "outside") {
    const heading = /^#{1,2} (.+)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    if (line.startsWith(`${FENCE} example`)) {
      extension = line.slice(FENCE.length + " example".length).trim();
      state = "markdown";
      markdown = [];
      html = [];
      startLine = i + 1;
    }
    continue;
  }
  if (state === "markdown") {
    if (line === ".") {
      state = "html";
    } else {
      markdown.push(line);
    }
    continue;
  }
  // state === "html"
  if (line === FENCE) {
    examples.push({
      markdown: untab(markdown.join("\n") + "\n"),
      html: untab(html.join("\n") + "\n"),
      example: examples.length + 1,
      start_line: startLine,
      end_line: i + 1,
      section,
      extension,
    });
    state = "outside";
  } else {
    html.push(line);
  }
}

// The spec renders tabs as → so they are visible in the printed document.
function untab(text) {
  return text.replaceAll("→", "\t");
}

writeFileSync(output, JSON.stringify(examples, null, 1) + "\n");
console.log(`wrote ${examples.length} examples to ${output}`);
