/**
 * Lazy mermaid renderer with a result cache.
 *
 * The mermaid library (several megabytes) is imported on the first diagram
 * only (CLAUDE.md invariant 5). Results are cached by a hash of the source
 * and the theme, so retyping elsewhere in the document or scrolling a widget
 * back into view never re-renders. Renders are serialized because mermaid
 * keeps global configuration (the theme) between calls.
 */
import type { Mermaid } from "mermaid";

export interface MermaidResult {
  readonly svg?: string;
  readonly error?: string;
}

let modulePromise: Promise<Mermaid> | null = null;
let initializedDark: boolean | null = null;
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

const results = new Map<string, MermaidResult>();
const pending = new Map<string, Promise<MermaidResult>>();
const MAX_CACHED = 200;

/** cyrb53: small, fast, well-distributed 53-bit string hash. */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function cacheKey(source: string, dark: boolean): string {
  return `${dark ? "d" : "l"}${contentHash(source)}`;
}

function loadMermaid(): Promise<Mermaid> {
  modulePromise ??= import("mermaid").then((m) => m.default);
  return modulePromise;
}

function remember(key: string, result: MermaidResult): MermaidResult {
  if (results.size >= MAX_CACHED) {
    const oldest = results.keys().next().value;
    if (oldest !== undefined) {
      results.delete(oldest);
    }
  }
  results.set(key, result);
  return result;
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "object" && err !== null && "str" in err) {
    return String(err.str);
  }
  return String(err);
}

async function renderNow(source: string, dark: boolean): Promise<MermaidResult> {
  const mermaid = await loadMermaid();
  if (initializedDark !== dark) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "default",
      fontFamily: "inherit",
    });
    initializedDark = dark;
  }
  counter += 1;
  const id = `gcmd-mermaid-${String(counter)}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return { svg };
  } catch (err: unknown) {
    // Mermaid may leave its scratch element behind after a parse error.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
    return { error: describe(err) };
  }
}

/** The cached result for this source and theme, if it has been rendered. */
export function cachedMermaid(source: string, dark: boolean): MermaidResult | undefined {
  return results.get(cacheKey(source, dark));
}

/** Renders (or returns the cached result for) a mermaid source. */
export function renderMermaid(source: string, dark: boolean): Promise<MermaidResult> {
  const key = cacheKey(source, dark);
  const cached = results.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }
  let inFlight = pending.get(key);
  if (!inFlight) {
    inFlight = queue
      .then(() => renderNow(source, dark))
      .then((result) => remember(key, result))
      .finally(() => {
        pending.delete(key);
      });
    queue = inFlight.catch(() => undefined);
    pending.set(key, inFlight);
  }
  return inFlight;
}
