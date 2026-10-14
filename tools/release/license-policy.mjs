// License expressions of third-party packages and the allow-list of licenses
// GCMD (GPL-3.0-or-later, ADR 0011) can ship. Pure functions used by
// licenses.mjs and unit-tested in license-policy.test.mjs.

/** Licenses compatible with GPL-3.0-or-later; a `WITH` exception is listed whole. */
export const ALLOWED = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Zlib",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "Unicode-3.0",
  "Apache-2.0",
  "Apache-2.0 WITH LLVM-exception",
  "MPL-2.0",
]);

/**
 * Licenses allowed for one package only, because GCMD's license grants an
 * additional permission to combine with it (`LICENSE-EXCEPTION`, ADR 0012).
 * Keyed by `ecosystem:name`. `source` (with `{version}`) is where the
 * package's source code is, which its license requires recipients be told.
 */
export const PACKAGE_EXCEPTIONS = {
  "npm:elkjs": {
    license: "EPL-2.0",
    source:
      "https://github.com/kieler/elkjs/tree/{version}, compiled from the Eclipse Layout Kernel, https://github.com/eclipse-elk/elk",
  },
};

/** The allow-list for one package: ALLOWED plus its PACKAGE_EXCEPTIONS license. */
export function allowedFor(ecosystem, name, exceptions = PACKAGE_EXCEPTIONS) {
  const exception = exceptions[`${ecosystem}:${name}`];
  return exception === undefined ? ALLOWED : new Set([...ALLOWED, exception.license]);
}

/**
 * Parses an SPDX license expression into a tree of
 * `{ type: "license", id, exception }` and `{ type: "and" | "or", items }`.
 * Accepts the legacy `A/B` form of old Cargo manifests as `A OR B`, and
 * lower-case operators. Throws on anything else.
 */
export function parseExpression(expression) {
  const tokens = expression
    .replace(/\//g, " OR ")
    .split(/(\(|\)|\s+)/)
    .filter((t) => t.trim() !== "");
  let pos = 0;
  const peek = () => tokens[pos]?.toUpperCase();
  const fail = (what) => {
    throw new Error(`${what} in license expression "${expression}"`);
  };

  const id = () => {
    const token = tokens[pos];
    if (token === undefined || ["(", ")", "AND", "OR", "WITH"].includes(token.toUpperCase())) {
      fail(token === undefined ? "unexpected end" : `unexpected "${token}"`);
    }
    pos += 1;
    return token;
  };
  const atom = () => {
    if (peek() === "(") {
      pos += 1;
      const inner = or();
      if (peek() !== ")") fail("missing )");
      pos += 1;
      return inner;
    }
    const license = { type: "license", id: id(), exception: null };
    if (peek() === "WITH") {
      pos += 1;
      license.exception = id();
    }
    return license;
  };
  const list = (type, operator, next) => () => {
    const items = [next()];
    while (peek() === operator) {
      pos += 1;
      items.push(next());
    }
    return items.length === 1 ? items[0] : { type, items };
  };
  const and = list("and", "AND", atom);
  const or = list("or", "OR", and);

  const tree = or();
  if (pos !== tokens.length) fail(`unexpected "${tokens[pos]}"`);
  return tree;
}

/** The allow-list key of a single license: `Apache-2.0 WITH LLVM-exception`. */
export function licenseKey(license) {
  return license.exception === null ? license.id : `${license.id} WITH ${license.exception}`;
}

/** True when the expression can be satisfied with allowed licenses only. */
export function isAllowed(tree, allowed = ALLOWED) {
  switch (tree.type) {
    case "license":
      return allowed.has(licenseKey(tree));
    case "and":
      return tree.items.every((item) => isAllowed(item, allowed));
    default:
      return tree.items.some((item) => isAllowed(item, allowed));
  }
}

/**
 * Checks a package's license expression. Returns null when it may ship,
 * otherwise the reason it may not.
 */
export function licenseProblem(expression, allowed = ALLOWED) {
  if (typeof expression !== "string" || expression.trim() === "") return "no license";
  let tree;
  try {
    tree = parseExpression(expression);
  } catch (error) {
    return error.message;
  }
  return isAllowed(tree, allowed) ? null : `license "${expression}" is not allowed`;
}

/**
 * The licenses GCMD complies with for an allowed expression: every part of
 * an AND, and for an OR the allowed option that comes first in
 * `preference` (then the first allowed one). Decides which license files of
 * a dual-licensed package are reproduced, and the standard text for packages
 * that ship no license file.
 */
export function chosenLicenses(tree, preference = [], allowed = ALLOWED) {
  switch (tree.type) {
    case "license":
      return [licenseKey(tree)];
    case "and":
      return tree.items.flatMap((item) => chosenLicenses(item, preference, allowed));
    default: {
      const options = tree.items.filter((item) => isAllowed(item, allowed));
      const rank = (item) => {
        const keys = chosenLicenses(item, preference, allowed);
        const worst = Math.max(...keys.map((k) => preference.indexOf(k)));
        return keys.some((k) => !preference.includes(k)) ? Infinity : worst;
      };
      const best = options.reduce((a, b) => (rank(b) < rank(a) ? b : a), options[0]);
      return best === undefined ? [] : chosenLicenses(best, preference, allowed);
    }
  }
}

// File-name words that say which license a file holds (LICENSE-MIT,
// LICENSE.apache2, UNLICENSE, COPYING.zlib...), with the SPDX prefix they mean.
const FILE_NAME_LICENSES = [
  [/^apache/, "Apache-"],
  [/^mit$/, "MIT"],
  [/^bsd/, "BSD-"],
  [/^zlib$/, "Zlib"],
  [/^unlicense$/, "Unlicense"],
  [/^mpl/, "MPL-"],
  [/^isc$/, "ISC"],
  [/^cc0/, "CC0-"],
  [/^unicode$/, "Unicode-"],
];

/** The SPDX prefix a license file's name points to, or null for LICENSE, NOTICE... */
export function fileNameLicense(fileName) {
  const words = fileName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => !["license", "licence", "licenses", "copying", "txt", "md"].includes(w));
  for (const word of words) {
    for (const [pattern, prefix] of FILE_NAME_LICENSES) if (pattern.test(word)) return prefix;
  }
  return null;
}

/**
 * Drops the license files of OR options GCMD does not use (LICENSE-APACHE of
 * an `MIT OR Apache-2.0` package used under MIT). Files whose name does not
 * name a license (LICENSE, NOTICE, COPYRIGHT) are always kept, and nothing is
 * dropped if no file would remain.
 */
export function filesForLicenses(files, chosen) {
  const used = (f) => {
    const prefix = fileNameLicense(f.name);
    return prefix === null || chosen.some((key) => key.startsWith(prefix));
  };
  const kept = files.filter(used);
  return kept.length > 0 ? kept : files;
}
