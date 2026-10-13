/**
 * Registers every editor-level command. File and window commands
 * (`file.*`, `view.*`) are registered by `app/session.ts`, which owns the
 * state they need; they still go through the same registry.
 */
import {
  copyLineDown,
  copyLineUp,
  deleteLine,
  indentLess,
  indentMore,
  moveLineDown,
  moveLineUp,
  redo,
  selectAll,
  selectLineDown,
  selectLineUp,
  simplifySelection,
  undo,
} from "@codemirror/commands";
import { deleteMarkupBackward, insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { closeSearchPanel, findNext, findPrevious, openSearchPanel } from "@codemirror/search";
import { dismissQuickbar, quickbarVisible } from "../quickbar";
import { detectFenceLanguage } from "./code";
import { lineDownIntoBlocks, lineUpIntoBlocks } from "./cursor";
import {
  clearFormatting,
  insertLink,
  toggleEmphasis,
  toggleInlineCode,
  toggleStrikethrough,
  toggleStrong,
} from "./format";
import { setHeadingLevel } from "./headings";
import { toggleTask } from "./lists";
import { defineCommand, type CommandDef, type CommandRunner } from "./registry";
import { alignTable, nextCell, prevCell } from "./table";

/** Hides the quickbar; false when it is not showing so Escape falls through. */
const hideQuickbar: CommandRunner = (view) => {
  if (!quickbarVisible(view.state)) {
    return false;
  }
  view.dispatch({ effects: dismissQuickbar.of(null) });
  return true;
};

export { defineCommand, getCommand, listCommands, runCommand } from "./registry";
export type { CommandDef, CommandRunner } from "./registry";

/** Runs the commands in order until one handles the key. */
function chain(...runners: CommandRunner[]): CommandRunner {
  return (view) => runners.some((run) => run(view));
}

export const editorCommands: readonly CommandDef[] = [
  defineCommand({ id: "format.strong", title: "Bold", run: toggleStrong }),
  defineCommand({ id: "format.emphasis", title: "Italic", run: toggleEmphasis }),
  defineCommand({ id: "format.inlineCode", title: "Inline code", run: toggleInlineCode }),
  defineCommand({ id: "format.strikethrough", title: "Strikethrough", run: toggleStrikethrough }),
  defineCommand({ id: "format.link", title: "Insert link", run: insertLink }),
  defineCommand({
    id: "format.clearFormatting",
    title: "Clear formatting",
    run: clearFormatting,
  }),
  defineCommand({ id: "list.toggleTask", title: "Toggle task", run: toggleTask }),
  defineCommand({ id: "format.paragraph", title: "Paragraph", run: setHeadingLevel(0) }),
  defineCommand({ id: "format.heading1", title: "Heading 1", run: setHeadingLevel(1) }),
  defineCommand({ id: "format.heading2", title: "Heading 2", run: setHeadingLevel(2) }),
  defineCommand({ id: "format.heading3", title: "Heading 3", run: setHeadingLevel(3) }),
  defineCommand({ id: "format.heading4", title: "Heading 4", run: setHeadingLevel(4) }),
  defineCommand({ id: "format.heading5", title: "Heading 5", run: setHeadingLevel(5) }),
  defineCommand({ id: "format.heading6", title: "Heading 6", run: setHeadingLevel(6) }),
  defineCommand({ id: "line.duplicate", title: "Duplicate line", run: copyLineDown }),
  defineCommand({ id: "line.moveUp", title: "Move line up", run: moveLineUp }),
  defineCommand({ id: "line.moveDown", title: "Move line down", run: moveLineDown }),
  defineCommand({ id: "line.copyUp", title: "Copy line up", run: copyLineUp }),
  defineCommand({ id: "line.copyDown", title: "Copy line down", run: copyLineDown }),
  defineCommand({ id: "line.delete", title: "Delete line", run: deleteLine }),
  defineCommand({ id: "line.indent", title: "Indent", run: indentMore }),
  defineCommand({ id: "line.outdent", title: "Outdent", run: indentLess }),
  defineCommand({
    id: "edit.tab",
    title: "Next table cell, or indent",
    run: chain(nextCell, indentMore),
  }),
  defineCommand({
    id: "edit.shiftTab",
    title: "Previous table cell, or outdent",
    run: chain(prevCell, indentLess),
  }),
  defineCommand({ id: "table.nextCell", title: "Next table cell", run: nextCell }),
  defineCommand({ id: "table.prevCell", title: "Previous table cell", run: prevCell }),
  defineCommand({ id: "table.align", title: "Align table", run: alignTable }),
  defineCommand({
    id: "code.detectLanguage",
    title: "Detect code block language",
    run: detectFenceLanguage,
  }),
  defineCommand({ id: "cursor.lineDown", title: "Cursor down", run: lineDownIntoBlocks }),
  defineCommand({ id: "cursor.lineUp", title: "Cursor up", run: lineUpIntoBlocks }),
  defineCommand({
    id: "cursor.selectLineDown",
    title: "Extend selection down",
    run: selectLineDown,
  }),
  defineCommand({ id: "cursor.selectLineUp", title: "Extend selection up", run: selectLineUp }),
  defineCommand({
    id: "line.continueMarkup",
    title: "New line (continue list or quote)",
    run: insertNewlineContinueMarkup,
  }),
  defineCommand({
    id: "line.deleteMarkupBackward",
    title: "Backspace (remove list or quote marker)",
    run: deleteMarkupBackward,
  }),
  defineCommand({ id: "edit.undo", title: "Undo", run: undo }),
  defineCommand({ id: "edit.redo", title: "Redo", run: redo }),
  defineCommand({ id: "edit.selectAll", title: "Select all", run: selectAll }),
  defineCommand({
    id: "edit.escape",
    title: "Escape (hide quickbar, close search, collapse selection)",
    run: chain(hideQuickbar, closeSearchPanel, simplifySelection),
  }),
  defineCommand({ id: "search.find", title: "Find", run: openSearchPanel }),
  defineCommand({ id: "search.replace", title: "Replace", run: openSearchPanel }),
  defineCommand({ id: "search.next", title: "Find next", run: findNext }),
  defineCommand({ id: "search.previous", title: "Find previous", run: findPrevious }),
  defineCommand({ id: "search.close", title: "Close search", run: closeSearchPanel }),
];
