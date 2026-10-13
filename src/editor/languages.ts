/**
 * The code-fence language catalogue: `@codemirror/language-data` descriptions
 * (all loaded lazily on first use) plus helpers to map between the names the
 * UI shows and the words written into info strings.
 */
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

/** Descriptions sorted by display name, for the fence language dropdown. */
export const languageCatalogue: readonly LanguageDescription[] = [...languages].sort((a, b) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
);

/** The description matching an info-string word (`ts`, `TypeScript`, `c++`). */
export function describeLanguage(word: string): LanguageDescription | null {
  if (word === "") {
    return null;
  }
  return LanguageDescription.matchLanguageName(languageCatalogue, word, true);
}

/** The description for a display name as spelled in the catalogue. */
export function languageByName(name: string): LanguageDescription | null {
  return languageCatalogue.find((d) => d.name === name) ?? null;
}

/**
 * The word to write into an info string for a display name: the lowercased
 * name when it is a plain identifier (`typescript`, `json`), otherwise the
 * first alias (`cpp` for C++, `csharp` for C#).
 */
export function infoAliasFor(name: string): string {
  const lower = name.toLowerCase();
  if (/^[a-z0-9]+$/.test(lower)) {
    return lower;
  }
  const alias = languageByName(name)?.alias.find((a) => /^[a-z0-9]+$/.test(a));
  return alias ?? lower;
}
