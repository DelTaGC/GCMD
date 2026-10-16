/**
 * The table bar: a small toolbar shown above the table that holds the
 * cursor, with the row and column commands and the alignment of the
 * current column. Like the quickbar it is a CodeMirror tooltip whose
 * controls run registry commands; the bar never edits the document itself.
 *
 * Visibility is editor state: the main selection head is inside a table and
 * the bar was not dismissed (Escape, see `edit.escape`) for that table.
 * Leaving the table and coming back shows it again.
 */
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import {
  showTooltip,
  type EditorView,
  type Tooltip,
  type TooltipView,
  type ViewUpdate,
} from "@codemirror/view";
import { runCommand } from "./commands/registry";
import { columnAlignAt, tableAt } from "./commands/table";
import { commandButton, type Button } from "./quickbar";

/** Hides the bar until the cursor moves to another table. */
export const dismissTableBar = StateEffect.define();

interface TableBarState {
  /** Start of the table the bar was dismissed for, or null. */
  readonly dismissedAt: number | null;
  readonly tooltip: Tooltip | null;
}

export const TABLE_BAR_BUTTONS: readonly Button[] = [
  {
    command: "table.insertRowAbove",
    label: "+▲",
    title: "Insert row above",
    className: "cm-tablebar-row",
  },
  {
    command: "table.insertRowBelow",
    label: "+▼",
    title: "Insert row below",
    className: "cm-tablebar-row",
  },
  {
    command: "table.deleteRow",
    label: "− Row",
    title: "Delete row",
    className: "cm-tablebar-delete",
  },
  {
    command: "table.insertColumnLeft",
    label: "+◀",
    title: "Insert column left",
    className: "cm-tablebar-column",
  },
  {
    command: "table.insertColumnRight",
    label: "+▶",
    title: "Insert column right",
    className: "cm-tablebar-column",
  },
  {
    command: "table.deleteColumn",
    label: "− Col",
    title: "Delete column",
    className: "cm-tablebar-delete",
  },
  {
    command: "table.moveColumnLeft",
    label: "◀ Col",
    title: "Move column left",
    className: "cm-tablebar-move",
  },
  {
    command: "table.moveColumnRight",
    label: "Col ▶",
    title: "Move column right",
    className: "cm-tablebar-move",
  },
];

const ALIGN_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "table.alignColumnNone", label: "Default" },
  { value: "table.alignColumnLeft", label: "Left" },
  { value: "table.alignColumnCenter", label: "Center" },
  { value: "table.alignColumnRight", label: "Right" },
];

/** The alignment command matching the column at the cursor. */
export function alignCommandAt(state: EditorState): string {
  switch (columnAlignAt(state)) {
    case "left":
      return "table.alignColumnLeft";
    case "center":
      return "table.alignColumnCenter";
    case "right":
      return "table.alignColumnRight";
    default:
      return "table.alignColumnNone";
  }
}

/** Groups of buttons are separated by a thin rule. */
const GROUPS: readonly (readonly string[])[] = [
  ["table.insertRowAbove", "table.insertRowBelow", "table.deleteRow"],
  ["table.insertColumnLeft", "table.insertColumnRight", "table.deleteColumn"],
  ["table.moveColumnLeft", "table.moveColumnRight"],
];

function buildBar(view: EditorView): TooltipView {
  const dom = document.createElement("div");
  dom.className = "cm-quickbar cm-tablebar";
  dom.setAttribute("role", "toolbar");
  dom.setAttribute("aria-label", "Table");

  const byId = new Map(TABLE_BAR_BUTTONS.map((button) => [button.command, button]));
  GROUPS.forEach((group, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "cm-tablebar-separator";
      dom.append(separator);
    }
    for (const id of group) {
      const button = byId.get(id);
      if (button) {
        dom.append(commandButton(view, button));
      }
    }
  });

  const separator = document.createElement("span");
  separator.className = "cm-tablebar-separator";
  dom.append(separator);

  const select = document.createElement("select");
  select.className = "cm-quickbar-heading cm-tablebar-align";
  select.title = "Column alignment";
  for (const option of ALIGN_OPTIONS) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }
  select.value = alignCommandAt(view.state);
  select.addEventListener("change", () => {
    runCommand(select.value, view);
    view.focus();
  });
  dom.append(select);

  dom.append(
    commandButton(view, {
      command: "table.align",
      label: "Align",
      title: "Align table",
      className: "cm-tablebar-format",
    }),
  );

  return {
    dom,
    update(update: ViewUpdate): void {
      select.value = alignCommandAt(update.state);
    },
  };
}

interface Anchor {
  /** Start of the table holding the main selection head (its identity). */
  readonly from: number;
  /** End of the row holding the head: the bar hangs below that row. */
  readonly row: number;
}

/** The table holding the main selection head and the cursor's row, or null. */
function anchorAt(state: EditorState): Anchor | null {
  const head = state.selection.main.head;
  const model = tableAt(state, head);
  return model ? { from: model.from, row: state.doc.lineAt(head).to } : null;
}

/**
 * The bar hangs below the cursor's row and follows it from row to row, so
 * it stays in view in a long table. The quickbar sits above a selection, so
 * the two never overlap while a cell's content is selected after Tab or
 * Enter.
 */
function tooltipFor(anchor: Anchor | null, dismissedAt: number | null): Tooltip | null {
  if (anchor === null || anchor.from === dismissedAt) {
    return null;
  }
  return { pos: anchor.row, above: false, strictSide: false, arrow: false, create: buildBar };
}

export const tableBarState = StateField.define<TableBarState>({
  create: (state) => ({ dismissedAt: null, tooltip: tooltipFor(anchorAt(state), null) }),
  update(value, tr) {
    let dismissedAt = value.dismissedAt === null ? null : tr.changes.mapPos(value.dismissedAt, 1);
    const dismiss = tr.effects.some((effect) => effect.is(dismissTableBar));
    if (!dismiss && !tr.docChanged && !tr.selection) {
      return dismissedAt === value.dismissedAt ? value : { ...value, dismissedAt };
    }
    const anchor = anchorAt(tr.state);
    const from = anchor?.from ?? null;
    if (dismiss) {
      dismissedAt = from;
    } else if (dismissedAt !== null && from !== dismissedAt) {
      dismissedAt = null;
    }
    const tooltip = tooltipFor(anchor, dismissedAt);
    if (dismissedAt === value.dismissedAt && tooltip?.pos === value.tooltip?.pos) {
      return value;
    }
    return { dismissedAt, tooltip };
  },
  provide: (field) => showTooltip.from(field, (value) => value.tooltip),
});

export function tableBarVisible(state: EditorState): boolean {
  return state.field(tableBarState).tooltip !== null;
}

export const tableBar: Extension = [tableBarState];
