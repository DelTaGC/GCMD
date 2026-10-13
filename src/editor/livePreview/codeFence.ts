/**
 * Fenced and indented code blocks.
 *
 * Every line of a block gets a monospace background class. When a fenced
 * block is not active (the selection touches none of its lines) the opening
 * fence is replaced by a language dropdown and the closing fence is emptied,
 * so the fence lines act as the block's padding. Choosing a language in the
 * dropdown rewrites the info string (`commands/code.ts`).
 *
 * Labeled fences are highlighted by the nested parser that
 * `@codemirror/lang-markdown` loads lazily from `@codemirror/language-data`.
 * Unlabeled fences run the `detect/` heuristic: the dropdown shows the guess
 * as "name (auto)" and the content is highlighted by parsing it with that
 * language here, once its parser has loaded (a refresh is dispatched when it
 * does). Mermaid fences are owned by `mermaid.ts` while inactive.
 */
import type { LanguageDescription } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { ViewPlugin, WidgetType, type EditorView } from "@codemirror/view";
import type { SyntaxNodeRef, Tree } from "@lezer/common";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { detectLanguage, type DetectedLanguage } from "../../detect/detectLanguage";
import { setFenceLanguageAt } from "../commands/code";
import { describeLanguage, infoAliasFor, languageByName, languageCatalogue } from "../languages";
import { isActive } from "./activeBlock";
import {
  livePreviewFamily,
  refreshLivePreview,
  type Collector,
  type NodeVisitor,
} from "./decorate";

const AUTO_PREFIX = "auto:";

/** The opening fence, rendered as a language dropdown. */
export class LanguageSelectWidget extends WidgetType {
  constructor(
    readonly language: string,
    readonly detected: DetectedLanguage | null,
  ) {
    super();
  }

  override eq(other: LanguageSelectWidget): boolean {
    return other.language === this.language && other.detected === this.detected;
  }

  override toDOM(view: EditorView): HTMLElement {
    const label = document.createElement("span");
    label.className = "cm-code-label";
    const select = document.createElement("select");
    select.className = "cm-code-select";
    select.title = "Code block language";
    const option = (value: string, text: string): HTMLOptionElement => {
      const el = document.createElement("option");
      el.value = value;
      el.textContent = text;
      return el;
    };
    select.append(option("", "plain text"));
    const known = describeLanguage(this.language);
    if (this.language !== "" && !known) {
      select.append(option(`${AUTO_PREFIX}${this.language}`, this.language));
    }
    if (this.language === "" && this.detected !== null) {
      select.append(option(`${AUTO_PREFIX}${this.detected}`, `${this.detected} (auto)`));
    }
    for (const desc of languageCatalogue) {
      select.append(option(desc.name, desc.name));
    }
    select.value = known
      ? known.name
      : this.language !== ""
        ? `${AUTO_PREFIX}${this.language}`
        : this.detected !== null
          ? `${AUTO_PREFIX}${this.detected}`
          : "";
    select.addEventListener("change", () => {
      const value = select.value;
      if (value.startsWith(AUTO_PREFIX)) {
        return;
      }
      const pos = view.posAtDOM(label);
      setFenceLanguageAt(view, pos, value === "" ? "" : infoAliasFor(value));
      view.focus();
    });
    label.append(select);
    return label;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

class EmptyWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-code-fence-end";
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const emptyFence = new EmptyWidget();

function markLines(ref: SyntaxNodeRef, state: EditorState, out: Collector): void {
  const first = state.doc.lineAt(ref.from);
  const last = state.doc.lineAt(ref.to);
  for (let n = first.number; n <= last.number; n += 1) {
    const line = state.doc.line(n);
    let cls = "cm-code-line";
    if (n === first.number) {
      cls += " cm-code-first";
    }
    if (n === last.number) {
      cls += " cm-code-last";
    }
    out.line(line.from, cls);
  }
}

/** The language word of the info string (`ts {meta}` -> `ts`). */
export function infoLanguage(info: string): string {
  const word = /^\s*([^\s{]+)/.exec(info);
  return word?.[1] ?? "";
}

// ---------------------------------------------------------------------------
// Auto-detection and highlighting of unlabeled fences

const detectionCache = new Map<string, DetectedLanguage | null>();
const parseCache = new Map<string, Tree>();
const MAX_CACHE = 100;

function bounded<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(key, value);
  return value;
}

/** Cached heuristic result for a fence's content. */
export function detectFenceLanguage(code: string): DetectedLanguage | null {
  const cached = detectionCache.get(code);
  if (cached !== undefined) {
    return cached;
  }
  return bounded(detectionCache, code, detectLanguage(code));
}

const views = new Set<EditorView>();
const loading = new Set<LanguageDescription>();

/** Loads a language once and refreshes every editor when it is ready. */
function requestLoad(desc: LanguageDescription): void {
  if (loading.has(desc)) {
    return;
  }
  loading.add(desc);
  void desc.load().then(
    () => {
      for (const view of views) {
        view.dispatch({ effects: refreshLivePreview.of(null) });
      }
    },
    (err: unknown) => {
      console.warn(`language ${desc.name} failed to load`, err);
    },
  );
}

/** Highlights `[from, from + text.length)` with `desc`, per line. */
function highlightWith(
  desc: LanguageDescription,
  text: string,
  from: number,
  state: EditorState,
  out: Collector,
): void {
  const support = desc.support;
  if (!support) {
    requestLoad(desc);
    return;
  }
  const key = `${desc.name}\n${text}`;
  const tree = parseCache.get(key) ?? bounded(parseCache, key, support.language.parser.parse(text));
  highlightTree(tree, classHighlighter, (start, end, classes) => {
    // Plugin decorations may not cross line breaks: split tokens per line.
    let pos = from + start;
    const stop = from + end;
    while (pos < stop) {
      const line = state.doc.lineAt(pos);
      const to = Math.min(line.to, stop);
      out.mark(pos, to, classes);
      pos = to + 1;
    }
  });
}

/** Keeps the set of live views so lazy loads can refresh them. */
const trackViews = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      views.add(view);
    }

    destroy(): void {
      views.delete(this.view);
    }
  },
);

function decorateFence(ref: SyntaxNodeRef, state: EditorState, out: Collector): void {
  const node = ref.node;
  const marks = node.getChildren("CodeMark");
  const info = node.getChild("CodeInfo");
  const infoText = info ? state.doc.sliceString(info.from, info.to) : "";
  const language = infoLanguage(infoText);
  const active = isActive(state, ref.from, ref.to);
  if (!active && language.toLowerCase() === "mermaid") {
    return; // rendered as a diagram by the mermaid family
  }
  markLines(ref, state, out);
  if (active) {
    for (const mark of marks) {
      out.mark(mark.from, mark.to, "cm-mark");
    }
    if (info) {
      out.mark(info.from, info.to, "cm-code-info");
    }
    return;
  }
  let detected: DetectedLanguage | null = null;
  const text = node.getChild("CodeText");
  if (language === "" && text) {
    const code = state.doc.sliceString(text.from, text.to);
    detected = detectFenceLanguage(code);
    const desc = detected === null ? null : languageByName(detected);
    if (desc) {
      highlightWith(desc, code, text.from, state, out);
    }
  }
  const openLine = state.doc.lineAt(ref.from);
  out.replace(openLine.from, openLine.to, new LanguageSelectWidget(language, detected));
  const closing = marks[1];
  if (closing?.to === ref.to) {
    const closeLine = state.doc.lineAt(closing.from);
    if (closeLine.number !== openLine.number) {
      out.replace(closeLine.from, closeLine.to, emptyFence);
    }
  }
}

export const visitCodeFence: NodeVisitor = (ref, state, out) => {
  if (ref.name === "FencedCode") {
    decorateFence(ref, state, out);
    return false;
  }
  if (ref.name === "CodeBlock") {
    markLines(ref, state, out);
    return false;
  }
  return undefined;
};

export const codeFence: Extension = [livePreviewFamily(visitCodeFence), trackViews];
