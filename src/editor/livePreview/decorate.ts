/**
 * Shared machinery for live-preview element families.
 *
 * A family is a pure function `(state, ranges) => Collector output` that walks
 * the Lezer tree inside the given ranges and records decorations. This module
 * wraps such a function into a `ViewPlugin` limited to `view.visibleRanges`,
 * re-run when the document, viewport, selection or syntax tree changes, and
 * exposes the replaced ranges as atomic so the cursor never lands inside
 * hidden markup. Keeping the computation pure lets tests run it on a plain
 * `EditorState` without a DOM.
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  type WidgetType,
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import type { Extension } from "@codemirror/state";

/** A document range; `to` is exclusive as everywhere in CodeMirror. */
export interface DocRange {
  readonly from: number;
  readonly to: number;
}

/** Decorations produced by one family for one computation. */
export interface FamilyOutput {
  /** Everything: marks, line classes, hidden markup, widgets. */
  decorations: DecorationSet;
  /** Only the replaced ranges, fed to `EditorView.atomicRanges`. */
  atomic: DecorationSet;
}

const hidden = Decoration.replace({});

/** Accumulates decorations in any order; `finish()` sorts them. */
export class Collector {
  private readonly all: Range<Decoration>[] = [];
  private readonly replaced: Range<Decoration>[] = [];

  private readonly lineKeys = new Set<string>();

  /** Styles `[from, to)` with a CSS class. Empty ranges are ignored. */
  mark(from: number, to: number, className: string, attributes?: Record<string, string>): void {
    if (to > from) {
      const spec = attributes ? { class: className, attributes } : { class: className };
      this.all.push(Decoration.mark(spec).range(from, to));
    }
  }

  /** Adds a class to the line containing `pos`; duplicates are dropped. */
  line(pos: number, className: string): void {
    const key = `${String(pos)}:${className}`;
    if (!this.lineKeys.has(key)) {
      this.lineKeys.add(key);
      this.all.push(Decoration.line({ class: className }).range(pos));
    }
  }

  /** Hides `[from, to)` entirely (markup characters). */
  hide(from: number, to: number): void {
    if (to > from) {
      const range = hidden.range(from, to);
      this.all.push(range);
      this.replaced.push(range);
    }
  }

  /** Replaces `[from, to)` with a widget. */
  replace(from: number, to: number, widget: WidgetType): void {
    if (to > from) {
      const range = Decoration.replace({ widget }).range(from, to);
      this.all.push(range);
      this.replaced.push(range);
    }
  }

  finish(): FamilyOutput {
    return {
      decorations: Decoration.set(this.all, true),
      atomic: Decoration.set(this.replaced, true),
    };
  }
}

/** Visitor called for every tree node inside the requested ranges. */
export type NodeVisitor = (
  node: SyntaxNodeRef,
  state: EditorState,
  out: Collector,
) => boolean | undefined;

/** Pure computation of one family: tree walk inside `ranges`. */
export function computeFamily(
  state: EditorState,
  ranges: readonly DocRange[],
  visit: NodeVisitor,
): FamilyOutput {
  const out = new Collector();
  const tree = syntaxTree(state);
  for (const range of ranges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => visit(node, state, out),
    });
  }
  return out.finish();
}

/** Wraps a family computation into a view plugin plus atomic ranges. */
export function livePreviewFamily(visit: NodeVisitor): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        const out = computeFamily(view.state, view.visibleRanges, visit);
        this.decorations = out.decorations;
        this.atomic = out.atomic;
      }

      update(update: ViewUpdate): void {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          const out = computeFamily(update.state, update.view.visibleRanges, visit);
          this.decorations = out.decorations;
          this.atomic = out.atomic;
        }
      }
    },
    {
      decorations: (instance) => instance.decorations,
      provide: (self) =>
        EditorView.atomicRanges.of((view) => view.plugin(self)?.atomic ?? Decoration.none),
    },
  );
  return plugin;
}
