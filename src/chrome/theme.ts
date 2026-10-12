/**
 * Applies the theme preference to the document root. "system" follows the
 * OS `prefers-color-scheme` and tracks changes live.
 */
import type { ThemePreference } from "../ipc/settings";

export type ResolvedTheme = "light" | "dark";

const query = "(prefers-color-scheme: dark)";

export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === "system") {
    return systemDark ? "dark" : "light";
  }
  return pref;
}

export interface ThemeController {
  /** Current preference. */
  readonly preference: ThemePreference;
  /** Current effective theme. */
  readonly resolved: ResolvedTheme;
  set(pref: ThemePreference): void;
  /** Called whenever the effective theme changes. */
  onChange(listener: (resolved: ResolvedTheme) => void): void;
}

export function createThemeController(initial: ThemePreference): ThemeController {
  const media = window.matchMedia(query);
  let preference = initial;
  let resolved = resolveTheme(preference, media.matches);
  const listeners: ((resolved: ResolvedTheme) => void)[] = [];

  const apply = (): void => {
    const next = resolveTheme(preference, media.matches);
    document.documentElement.dataset["theme"] = next;
    if (next !== resolved) {
      resolved = next;
      for (const listener of listeners) {
        listener(resolved);
      }
    }
  };

  document.documentElement.dataset["theme"] = resolved;
  media.addEventListener("change", apply);

  return {
    get preference(): ThemePreference {
      return preference;
    },
    get resolved(): ResolvedTheme {
      return resolved;
    },
    set(pref: ThemePreference): void {
      preference = pref;
      apply();
    },
    onChange(listener): void {
      listeners.push(listener);
    },
  };
}
