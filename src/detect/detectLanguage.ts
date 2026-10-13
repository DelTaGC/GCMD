/** Language names as spelled by @codemirror/language-data `LanguageDescription.name`. */
export type DetectedLanguage =
  | "JavaScript"
  | "TypeScript"
  | "Python"
  | "Rust"
  | "Go"
  | "Java"
  | "C"
  | "C++"
  | "C#"
  | "HTML"
  | "CSS"
  | "JSON"
  | "YAML"
  | "TOML"
  | "Shell"
  | "PowerShell"
  | "SQL"
  | "Markdown";

/** One weighted regex feature. `max` caps how many matches are counted (default 1). */
interface Feature {
  readonly language: DetectedLanguage;
  readonly pattern: RegExp;
  readonly weight: number;
  readonly max: number;
}

const MAX_LINES = 60;
const MAX_CHARS = 4000;
/** The best score must reach this to count as a detection. */
const MIN_SCORE = 5;
/** The best score must beat the runner-up by at least this much (or 25% of itself). */
const MIN_MARGIN = 2;
/** TypeScript-specific evidence needed before TypeScript inherits the JavaScript score. */
const TS_EVIDENCE = 3;

type Langs = DetectedLanguage | readonly DetectedLanguage[];

/** Expands one rule into a feature per language. All patterns must carry the `g` flag. */
function rule(langs: Langs, pattern: RegExp, weight: number, max = 1): Feature[] {
  const list: readonly DetectedLanguage[] = typeof langs === "string" ? [langs] : langs;
  return list.map((language) => ({ language, pattern, weight, max }));
}

// Statements that cannot start a CSS selector line (keeps `interface X {` etc. out of CSS).
const NOT_SELECTOR =
  "(?!\\s*(?:export|declare|public|private|protected|static|abstract|const|let|var|pub|async|" +
  "interface|type|class|struct|enum|switch|if|for|while|else|function|impl|namespace|fn|func|" +
  "trait|match|try|catch)\\b)";
const CSS_RULE = new RegExp(
  `^${NOT_SELECTOR}[ \\t]*[^\\s{}][^{}\\n]*\\{[^{}]*?^[ \\t]*[\\w-]+[ \\t]*:[ \\t]*[^;{}\\s][^;{}\\n]*;`,
  "gm",
);
const TAGS =
  "div|span|p|a|ul|ol|li|body|head|h[1-6]|section|script|style|meta|link|title|img|form|input|" +
  "button|table|tr|td|nav|header|footer|main|br|label|select|option|textarea|pre|code";
const HTML_TAG = new RegExp(`<\\/?(?:${TAGS})(?:\\s[^<>]*)?\\/?>`, "gi");
const CMDLET =
  "(?:Get|Set|New|Remove|Invoke|Write|Import|Export|Select|Where|ForEach|Out|Add|Start|Stop|Test)";

/** The feature table. Extend by appending `rule(...)` entries. */
const FEATURES: readonly Feature[] = [
  // Shebangs dominate everything else.
  ...rule("Shell", /^#!\s*\/(?:usr\/)?(?:local\/)?bin\/(?:env\s+)?(?:ba|z|da|k)?sh\b/g, 10),
  ...rule("Python", /^#!.*\bpython[\d.]*\b/g, 10),
  ...rule("JavaScript", /^#!.*\bnode\b/g, 10),
  ...rule("PowerShell", /^#!.*\bpwsh\b/g, 10),

  // Shell
  ...rule(
    "Shell",
    /^[ \t]*(?:sudo|apt(?:-get)?|brew|npm|npx|pip3?|git|cd|ls|cp|mv|rm|mkdir|chmod|curl|wget|docker|cargo|echo|export|source)\s/gm,
    3,
    2,
  ),
  ...rule("Shell", /^\$ \S/gm, 4),
  ...rule("Shell", /\$\(|\$\{\w+/g, 2),
  ...rule("Shell", /^[ \t]*(?:fi|done|then|esac)[ \t]*$/gm, 3),
  ...rule("Shell", /\bset -[euxo]+/g, 4),
  ...rule("Shell", /^[ \t]*if \[/gm, 4),
  ...rule("Shell", /\bexport \w+=/g, 3),

  // PowerShell
  ...rule("PowerShell", /\bWrite-Host\b/g, 6),
  ...rule("PowerShell", /\$PSVersionTable\b/g, 8),
  ...rule("PowerShell", /^[ \t]*param[ \t]*\(/gim, 5),
  ...rule("PowerShell", new RegExp(`\\b${CMDLET}-[A-Z]\\w+`, "g"), 5),
  ...rule("PowerShell", /^[ \t]*\$\w+[ \t]*=/gm, 2, 2),
  ...rule("PowerShell", /\$_\b/g, 2),
  ...rule("PowerShell", /\s-(?:eq|ne|gt|lt|ge|le|match|like)\b/g, 3),
  ...rule("PowerShell", /\[(?:string|int|bool|switch)\]\s*\$/g, 3),

  // Python
  ...rule("Python", /^[ \t]*def \w+\(.*\)[ \t]*(?:->.*)?:[ \t]*$/gm, 5),
  ...rule("Python", /^from [\w.]+ import /gm, 5),
  ...rule("Python", /^import [\w.]+(?:\s+as\s+\w+)?[ \t]*$/gm, 3),
  ...rule("Python", /^[ \t]*class \w+(?:\(.*\))?:[ \t]*$/gm, 5),
  ...rule("Python", /\bprint\(/g, 2),
  ...rule("Python", /^[ \t]*(?:elif|except)\b.*:/gm, 4),
  ...rule("Python", /\bif __name__ ==/g, 6),
  ...rule("Python", /^[ \t]*(?:if|for|while|else|with|try)\b.*:[ \t]*$/gm, 2),
  ...rule("Python", /\bself\.\w+/g, 2),
  ...rule("Python", /\b(?:None|True|False)\b/g, 2),
  ...rule("Python", /\bf"[^"\n]*\{/g, 1.5),

  // Rust
  ...rule("Rust", /\bfn \w+\s*[(<]/g, 5),
  ...rule("Rust", /\blet mut\b/g, 5),
  ...rule(
    "Rust",
    /\b(?:println|print|eprintln|format|vec|panic|assert|assert_eq|write|writeln)!/g,
    5,
  ),
  ...rule("Rust", /^[ \t]*use [\w:]+(?:::\{|;)/gm, 3),
  ...rule("Rust", /\bpub (?:fn|struct|enum|mod|trait)\b/g, 4),
  ...rule("Rust", /#\[derive\(/g, 5),
  ...rule("Rust", /^[ \t]*impl\b(?:<[^>]*>)?\s+\w+/gm, 3),
  ...rule("Rust", /&mut\s/g, 2),
  ...rule("Rust", /\bmatch\b.*\{/g, 1),

  // Go
  ...rule("Go", /^package \w+[ \t]*$/gm, 6),
  ...rule("Go", /\bfunc (?:\(\w+ \*?\w+\) )?\w+\(/g, 5),
  ...rule("Go", /:=/g, 3),
  ...rule("Go", /^import \(/gm, 4),
  ...rule("Go", /\bfmt\.\w+\(/g, 5),
  ...rule("Go", /\berr != nil\b/g, 5),
  ...rule("Go", /\b(?:defer|chan|go func)\b/g, 3),

  // Java
  ...rule("Java", /\bpublic static void main\b/g, 8),
  ...rule("Java", /\bSystem\.(?:out|err)\.print/g, 6),
  ...rule("Java", /^package [\w.]+;/gm, 4),
  ...rule("Java", /^import (?:static )?[\w.]+(?:\.\*)?;/gm, 4),
  ...rule("Java", /@Override\b/g, 5),
  ...rule("Java", /\bString\[\]\s+\w+/g, 3),
  ...rule("Java", /\b(?:extends|implements)\s+\w+/g, 2),
  ...rule(
    ["Java", "C#"],
    /\b(?:public|private|protected) (?:static )?(?:final )?(?:class|interface|enum)\b/g,
    2,
  ),
  ...rule(["Java", "C#"], /\bpublic static void\b/g, 3),

  // C#
  ...rule("C#", /^using [\w.]+;/gm, 6),
  ...rule("C#", /\bnamespace [\w.]+/g, 3),
  ...rule("C#", /\bConsole\.Write(?:Line)?\(/g, 6),
  ...rule("C#", /\{\s*get;\s*(?:set|init)?;?\s*\}/g, 6),
  ...rule("C#", /\bstatic (?:async )?(?:void|Task) Main\(/g, 6),
  ...rule("C#", /\bstring\[\]\s+\w+/g, 3),
  ...rule("C#", /\basync Task\b/g, 4),
  ...rule("C#", /\bforeach\s*\(/g, 2),
  ...rule("C#", /\bnew List<\w+>/g, 2),

  // C and C++
  ...rule("C", /#include\s*<\w+\.h>/g, 6),
  ...rule("C", /\bprintf\(/g, 4),
  ...rule("C", /\b(?:malloc|free|sizeof)\(/g, 3),
  ...rule("C", /\btypedef\b/g, 3),
  ...rule("C", /\bNULL\b/g, 2),
  ...rule("C", /\bstruct \w+\s*\{/g, 2),
  ...rule(["C", "C++"], /\bint main\s*\(/g, 3),
  ...rule(["C", "C++"], /^[ \t]*#define\s+\w+/gm, 2),
  ...rule("C++", /(?<!\buse\s)\bstd::\w+/g, 6),
  ...rule("C++", /#include\s*<[a-z_]+>/g, 5),
  ...rule("C++", /\btemplate\s*</g, 6),
  ...rule("C++", /\bclass \w+/g, 3),
  ...rule("C++", /\b(?:cout|cin|cerr)\b/g, 5),
  ...rule("C++", /\busing namespace\b/g, 5),
  ...rule("C++", /\b(?:nullptr|constexpr)\b/g, 3),
  ...rule("C++", /^[ \t]*(?:public|private|protected):/gm, 4),

  // HTML
  ...rule("HTML", /<!DOCTYPE html>/gi, 10),
  ...rule("HTML", /<html\b/gi, 5),
  ...rule("HTML", HTML_TAG, 4, 2),
  ...rule("HTML", /<\/\w+>/g, 1),

  // CSS
  ...rule("CSS", CSS_RULE, 5),
  ...rule(
    "CSS",
    /^[ \t]*(?:color|background(?:-color)?|margin|padding|font(?:-size|-family|-weight)?|display|border(?:-radius)?|width|height|position|flex|grid|text-align|line-height|opacity|z-index)[ \t]*:[ \t]*[^;\n]+;/gm,
    4,
  ),
  ...rule("CSS", /@(?:media|import|keyframes|font-face)\b/g, 4),
  ...rule("CSS", /^[ \t]*[.#][\w-]+[^{\n]*\{/gm, 3),

  // JSON
  ...rule("JSON", /^\s*\{\s*"/g, 4),
  ...rule("JSON", /^\s*\[\s*[{["\d-]/g, 3),
  ...rule("JSON", /"[^"\n]+"\s*:/g, 3),
  ...rule("JSON", /^\s*[[{][\s\S]*[\]}]\s*$/g, 2),

  // YAML
  ...rule("YAML", /^[a-z_][\w-]*:[ \t]+[^\s{[].*$/gm, 2, 3),
  ...rule("YAML", /^[ \t]+[\w-]+:[ \t]+[^\s;{[][^;{}]*$/gm, 1, 3),
  ...rule("YAML", /^[ \t]*-[ \t]+\S/gm, 1, 3),
  ...rule("YAML", /^[ \t]*-[ \t]+[\w-]+:[ \t]+\S/gm, 3),
  ...rule("YAML", /^[a-z_][\w-]*:[ \t]*$/gm, 2),
  ...rule("YAML", /^---[ \t]*$/gm, 1),

  // TOML
  ...rule("TOML", /^\[\[?[\w.-]+\]\]?[ \t]*$/gm, 4),
  ...rule("TOML", /^[\w-]+ = (?:"[^"]*"|'[^']*'|\d|true|false|\[)/gm, 1, 4),

  // SQL
  ...rule("SQL", /\bSELECT\b[^;]*\bFROM\b/g, 6),
  ...rule("SQL", /\bselect\s+(?:\*|[\w.*()]+(?:\s*,\s*[\w.*()]+)*)\s+from\s+\w+/gi, 6),
  ...rule("SQL", /\bINSERT\s+INTO\b/gi, 6),
  ...rule("SQL", /\bUPDATE\s+\w+\s+SET\b/g, 6),
  ...rule("SQL", /\bDELETE\s+FROM\b/g, 6),
  ...rule("SQL", /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|VIEW|DATABASE)\b/g, 6),
  ...rule("SQL", /\b(?:WHERE|GROUP BY|ORDER BY|LEFT JOIN|INNER JOIN|JOIN|HAVING)\b/g, 2, 2),

  // Markdown
  ...rule("Markdown", /^#{1,6}[ \t]+\S/gm, 3),
  ...rule("Markdown", /^[ \t]*[-*+] \[[ xX]\]/gm, 5),
  ...rule("Markdown", /\*\*[^*\n]+\*\*/g, 3),
  ...rule("Markdown", /\[[^\]\n]+\]\([^)\n]+\)/g, 3),
  ...rule("Markdown", /^>[ \t]\S/gm, 2),
  ...rule("Markdown", /^```/gm, 4),
  ...rule("Markdown", /^[ \t]*[-*+][ \t]+\S/gm, 1, 3),
  ...rule("Markdown", /^\d+\.[ \t]+\S/gm, 1, 2),

  // JavaScript (TypeScript inherits these when it has TypeScript-specific evidence)
  ...rule("JavaScript", /\bconst \w+\s*=/g, 2),
  ...rule("JavaScript", /\blet \w+\s*=/g, 1),
  ...rule("JavaScript", /=>/g, 2),
  ...rule("JavaScript", /\bconsole\.(?:log|error|warn|info)\(/g, 5),
  ...rule("JavaScript", /\brequire\(/g, 4),
  ...rule("JavaScript", /\bmodule\.exports\b|\bexports\.\w+/g, 4),
  ...rule("JavaScript", /^import\s+[\w{},*\s]+\s+from\s+['"]/gm, 4),
  ...rule(
    "JavaScript",
    /^[ \t]*export\s+(?:default\s+|const\s+|function\s+|class\s+|async\s+)/gm,
    3,
  ),
  ...rule("JavaScript", /\bfunction\s*\w*\s*\(/g, 3),
  ...rule("JavaScript", /===|!==/g, 3),
  ...rule("JavaScript", /\bawait\b/g, 2),
  ...rule("JavaScript", /\b(?:document|window)\.\w+/g, 3),
  ...rule("JavaScript", /\bnew Promise\b|\.then\(/g, 3),

  // TypeScript-specific
  ...rule("TypeScript", /[\w)\]?]\s?:\s*(?:string|number|boolean|unknown)\b(?!\s+\w)/g, 5),
  ...rule("TypeScript", /\)\s*:\s*(?:void|any|never|Promise<)/g, 4),
  ...rule("TypeScript", /^[ \t]*(?:export\s+)?interface\s+\w+(?:\s+extends\s+[\w, ]+)?\s*\{/gm, 6),
  ...rule("TypeScript", /^[ \t]*export\s+(?:type|interface|enum|declare|abstract)\b/gm, 5),
  ...rule("TypeScript", /^[ \t]*type\s+\w+(?:<[^>\n]*>)?\s*=/gm, 5),
  ...rule("TypeScript", /\b(?:Array|Promise|Record|Partial|Readonly|Omit|Pick)<[^>\n]+>/g, 3),
  ...rule("TypeScript", /\bas (?:const|unknown|string|number|any)\b/g, 3),
  ...rule("TypeScript", /\breadonly\s+\w+/g, 3),
  ...rule("TypeScript", /^[ \t]*(?:public|private|protected)\s+(?:readonly\s+)?\w+\??:\s*\w+/gm, 4),
  ...rule("TypeScript", /\bimport type\b/g, 6),
  ...rule("TypeScript", /\bconstructor\(\s*(?:private|public|readonly)/g, 5),
  ...rule("TypeScript", /\w:\s*\w+\[\]/g, 3),
];

function sample(code: string): string {
  return code
    .slice(0, MAX_CHARS)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, MAX_LINES)
    .join("\n");
}

function score(text: string): Map<DetectedLanguage, number> {
  const scores = new Map<DetectedLanguage, number>();
  for (const { language, pattern, weight, max } of FEATURES) {
    const hits = text.match(pattern)?.length ?? 0;
    if (hits > 0) scores.set(language, (scores.get(language) ?? 0) + weight * Math.min(hits, max));
  }
  // TypeScript is a superset of JavaScript: with real type evidence it absorbs the JS score.
  const ts = scores.get("TypeScript") ?? 0;
  if (ts >= TS_EVIDENCE) {
    scores.set("TypeScript", ts + (scores.get("JavaScript") ?? 0));
    scores.delete("JavaScript");
  } else {
    scores.delete("TypeScript");
  }
  return scores;
}

/** Best guess for the language of an unlabeled code fence, or null when nothing scores clearly. */
export function detectLanguage(code: string): DetectedLanguage | null {
  const text = sample(code);
  if (text.trim() === "") return null;
  const ranked = [...score(text)].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best === undefined || best[1] < MIN_SCORE) return null;
  const runnerUp = second?.[1] ?? 0;
  if (best[1] - runnerUp < Math.max(MIN_MARGIN, best[1] * 0.25)) return null;
  return best[0];
}
