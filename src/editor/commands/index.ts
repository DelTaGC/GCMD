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
  undo,
} from "@codemirror/commands";
import { deleteMarkupBackward, insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { closeSearchPanel, findNext, findPrevious, openSearchPanel } from "@codemirror/search";
import {
  insertLink,
  toggleEmphasis,
  toggleInlineCode,
  toggleStrikethrough,
  toggleStrong,
} from "./format";
import { setHeadingLevel } from "./headings";
import { defineCommand, type CommandDef } from "./registry";

export { defineCommand, getCommand, listCommands, runCommand } from "./registry";
export type { CommandDef, CommandRunner } from "./registry";

export const editorCommands: readonly CommandDef[] = [
  defineCommand({ id: "format.strong", title: "Bold", run: toggleStrong }),
  defineCommand({ id: "format.emphasis", title: "Italic", run: toggleEmphasis }),
  defineCommand({ id: "format.inlineCode", title: "Inline code", run: toggleInlineCode }),
  defineCommand({ id: "format.strikethrough", title: "Strikethrough", run: toggleStrikethrough }),
  defineCommand({ id: "format.link", title: "Insert link", run: insertLink }),
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
  defineCommand({ id: "search.find", title: "Find", run: openSearchPanel }),
  defineCommand({ id: "search.replace", title: "Replace", run: openSearchPanel }),
  defineCommand({ id: "search.next", title: "Find next", run: findNext }),
  defineCommand({ id: "search.previous", title: "Find previous", run: findPrevious }),
  defineCommand({ id: "search.close", title: "Close search", run: closeSearchPanel }),
];
