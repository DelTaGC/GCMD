/**
 * The quickbar: a small formatting toolbar shown above a non-empty
 * selection. It is a CodeMirror tooltip, so positioning and scrolling are
 * handled by the editor. Every button runs a registry command; the bar never
 * edits the document itself.
 *
 * Visibility is editor state: the main selection is non-empty, no mouse
 * drag is in progress, and the bar was not dismissed (Escape, see
 * `edit.escape`) since the selection last changed.
 */
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import {
  ViewPlugin,
  showTooltip,
  type EditorView,
  type Tooltip,
  type TooltipView,
  type ViewUpdate,
} from "@codemirror/view";
import { headingLevelAt } from "./commands/headings";
import { runCommand } from "./commands/registry";
import { shortcutLabel } from "./keymap";

/** Hides the bar until the selection changes. */
export const dismissQuickbar = StateEffect.define();

const setDragging = StateEffect.define<boolean>();

interface QuickbarState {
  readonly dismissed: boolean;
  readonly dragging: boolean;
  readonly tooltip: Tooltip | null;
}

interface Button {
  readonly command: string;
  readonly label: string;
  readonly title: string;
  readonly className: string;
}

export const QUICKBAR_BUTTONS: readonly Button[] = [
  { command: "format.strong", label: "B", title: "Bold", className: "cm-quickbar-strong" },
  { command: "format.emphasis", label: "I", title: "Italic", className: "cm-quickbar-emphasis" },
  {
    command: "format.inlineCode",
    label: "<>",
    title: "Inline code",
    className: "cm-quickbar-code",
  },
  {
    command: "format.strikethrough",
    label: "S",
    title: "Strikethrough",
    className: "cm-quickbar-strike",
  },
  { command: "format.link", label: "Link", title: "Insert link", className: "cm-quickbar-link" },
  {
    command: "format.clearFormatting",
    label: "Clear",
    title: "Clear formatting",
    className: "cm-quickbar-clear",
  },
];

const HEADING_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "format.paragraph", label: "Paragraph" },
  { value: "format.heading1", label: "Heading 1" },
  { value: "format.heading2", label: "Heading 2" },
  { value: "format.heading3", label: "Heading 3" },
  { value: "format.heading4", label: "Heading 4" },
  { value: "format.heading5", label: "Heading 5" },
  { value: "format.heading6", label: "Heading 6" },
];

/** The heading command matching the level of the line at the selection start. */
export function headingCommandAt(state: EditorState): string {
  const level = headingLevelAt(state, state.selection.main.from);
  return level === 0 ? "format.paragraph" : `format.heading${String(level)}`;
}

function buildBar(view: EditorView): TooltipView {
  const dom = document.createElement("div");
  dom.className = "cm-quickbar";
  dom.setAttribute("role", "toolbar");
  dom.setAttribute("aria-label", "Formatting");

  const select = document.createElement("select");
  select.className = "cm-quickbar-heading";
  select.title = "Heading level";
  for (const option of HEADING_OPTIONS) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }
  select.value = headingCommandAt(view.state);
  select.addEventListener("change", () => {
    runCommand(select.value, view);
    view.focus();
  });
  dom.append(select);

  for (const button of QUICKBAR_BUTTONS) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `cm-quickbar-button ${button.className}`;
    element.textContent = button.label;
    const shortcut = shortcutLabel(button.command);
    element.title = shortcut === null ? button.title : `${button.title} (${shortcut})`;
    element.setAttribute("aria-label", button.title);
    // Keep the editor focused and the selection intact.
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    element.addEventListener("click", () => {
      runCommand(button.command, view);
    });
    dom.append(element);
  }

  return {
    dom,
    update(update: ViewUpdate): void {
      select.value = headingCommandAt(update.state);
    },
  };
}

function tooltipFor(state: EditorState, dismissed: boolean, dragging: boolean): Tooltip | null {
  const main = state.selection.main;
  if (main.empty || dismissed || dragging) {
    return null;
  }
  return {
    pos: main.from,
    end: main.to,
    above: true,
    strictSide: false,
    arrow: false,
    create: buildBar,
  };
}

export const quickbarState = StateField.define<QuickbarState>({
  create: (state) => ({
    dismissed: false,
    dragging: false,
    tooltip: tooltipFor(state, false, false),
  }),
  update(value, tr) {
    let { dismissed, dragging } = value;
    if (tr.selection) {
      dismissed = false;
    }
    for (const effect of tr.effects) {
      if (effect.is(dismissQuickbar)) {
        dismissed = true;
      } else if (effect.is(setDragging)) {
        dragging = effect.value;
      }
    }
    if (dismissed === value.dismissed && dragging === value.dragging && !tr.selection) {
      return value;
    }
    return { dismissed, dragging, tooltip: tooltipFor(tr.state, dismissed, dragging) };
  },
  provide: (field) => showTooltip.from(field, (value) => value.tooltip),
});

export function quickbarVisible(state: EditorState): boolean {
  return state.field(quickbarState).tooltip !== null;
}

/** Tracks mouse drags so the bar appears once the selection is final. */
const dragTracker = ViewPlugin.fromClass(
  class {
    private readonly onMouseUp = (): void => {
      if (this.view.state.field(quickbarState).dragging) {
        this.view.dispatch({ effects: setDragging.of(false) });
      }
    };

    constructor(private readonly view: EditorView) {
      window.addEventListener("mouseup", this.onMouseUp);
    }

    destroy(): void {
      window.removeEventListener("mouseup", this.onMouseUp);
    }
  },
  {
    eventHandlers: {
      mousedown(event, view) {
        if (event.button === 0 && !view.state.field(quickbarState).dragging) {
          view.dispatch({ effects: setDragging.of(true) });
        }
        return false;
      },
    },
  },
);

export const quickbar: Extension = [quickbarState, dragTracker];
