/**
 * Shared machinery for live-preview element families.
 *
 * Two kinds of family exist:
 *
 * - `livePreviewFamily(visitor)`: a view plugin limited to
 *   `view.visibleRanges`, for marks, line classes, hidden markup and inline
 *   widgets. CodeMirror forbids plugin decorations that cover line breaks or
 *   that are block-level, so a fence line is replaced from `line.from` to
 *   `line.to` only.
 * - `blockFamily(visitor)`: a state field computed over the whole document,
 *   for block widgets that replace several lines (tables, mermaid). The
 *   visitor records every candidate block regardless of the selection; the
 *   active-block rule is applied when the decoration set is rendered, so a
 *   selection change never re-walks the tree.
 *
 * Both keep the computation pure (`EditorState` in, decorations out) so tests
 * run on a plain state without a DOM. Replaced ranges of plugin families are
 * exposed as atomic so the cursor never lands inside hidden markup.
 */
import { syntaxTree } from "@codemirror/language";
import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  type WidgetType,
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { editorDark } from "../theme";
import { isActive } from "./activeBlock";

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

/**
 * Asks every family to recompute, for example after a lazily loaded language
 * or renderer became available. Dispatch it as `{ effects: refreshLivePreview.of(null) }`.
 */
export const refreshLivePreview = StateEffect.define();

function hasRefresh(transactions: readonly Transaction[]): boolean {
  return transactions.some((tr) => tr.effects.some((e) => e.is(refreshLivePreview)));
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

  /** Replaces `[from, to)` with an inline widget. */
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
          syntaxTree(update.state) !== syntaxTree(update.startState) ||
          hasRefresh(update.transactions)
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

// ---------------------------------------------------------------------------
// Block families

/** A multi-line range rendered as one block widget while it is not active. */
export interface BlockSpec {
  readonly from: number;
  readonly to: number;
  readonly widget: WidgetType;
}

/**
 * Records every block of a family in document order. Return `false` to skip
 * a node's children (do so for every leaf block so the walk stays cheap).
 */
export type BlockVisitor = (
  node: SyntaxNodeRef,
  state: EditorState,
  blocks: BlockSpec[],
) => boolean | undefined;

/**
 * Ranges of every rendered block, from every block family. Cursor commands
 * use it to step into a block instead of jumping over its widget.
 */
export const blockRanges = Facet.define<readonly DocRange[], readonly DocRange[]>({
  combine: (values) => values.flat().sort((a, b) => a.from - b.from),
});

/** Nodes whose children can contain block constructs. */
const CONTAINERS = new Set(["Document", "BulletList", "OrderedList", "ListItem", "Blockquote"]);

/** Collects the blocks of one family over the whole document. */
export function collectBlocks(state: EditorState, visit: BlockVisitor): BlockSpec[] {
  const blocks: BlockSpec[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      const result = visit(node, state, blocks);
      if (result !== undefined) {
        return result;
      }
      return CONTAINERS.has(node.name);
    },
  });
  return blocks;
}

/** Applies the active-block rule: inactive blocks become block widgets. */
export function renderBlocks(state: EditorState, blocks: readonly BlockSpec[]): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const block of blocks) {
    if (!isActive(state, block.from, block.to)) {
      ranges.push(
        Decoration.replace({ widget: block.widget, block: true }).range(block.from, block.to),
      );
    }
  }
  return Decoration.set(ranges, true);
}

interface BlockFieldValue {
  readonly blocks: readonly BlockSpec[];
  readonly decorations: DecorationSet;
}

/** Wraps a block visitor into a state field providing block decorations. */
export function blockFamily(visit: BlockVisitor): Extension {
  const compute = (state: EditorState): BlockFieldValue => {
    const blocks = collectBlocks(state, visit);
    return { blocks, decorations: renderBlocks(state, blocks) };
  };
  const field = StateField.define<BlockFieldValue>({
    create: compute,
    update(value, tr) {
      if (
        tr.docChanged ||
        syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
        tr.state.facet(editorDark) !== tr.startState.facet(editorDark) ||
        hasRefresh([tr])
      ) {
        return compute(tr.state);
      }
      if (tr.selection) {
        return { blocks: value.blocks, decorations: renderBlocks(tr.state, value.blocks) };
      }
      return value;
    },
    provide: (self) => [
      EditorView.decorations.from(self, (value) => value.decorations),
      blockRanges.from(self, (value) => value.blocks),
    ],
  });
  return field;
}
