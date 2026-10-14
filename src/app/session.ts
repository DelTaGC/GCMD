/**
 * The document session: which file is open, its save metadata, the dirty
 * state, and the open / save / new / close flows. It registers the `file.*`,
 * `view.*` and `help.*` commands in the registry so menus and shortcuts run
 * them like any editing command.
 *
 * Dirty is computed by comparing the buffer with the last saved text, so
 * undoing back to the saved state clears the marker.
 *
 * The open file is watched (`ipc/document.ts`, `watcher.rs`): a change on
 * disk is reloaded silently while the buffer is clean and announced in the
 * banner (Reload / Keep) while it is dirty. Our own saves are told apart by
 * the modification time the write returned.
 */
import type { Text } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { Banner } from "../chrome/banner";
import type { Sidebar } from "../chrome/sidebar";
import type { ThemeController } from "../chrome/theme";
import { fileName, updateTitle } from "../chrome/title";
import { defineCommand } from "../editor/commands";
import { replaceDocument } from "../editor/create";
import { setDocumentPath } from "../editor/document";
import { setEditorDark } from "../editor/theme";
import { appInfo, openNewWindow } from "../ipc/app";
import { askUnsavedChanges, pickOpenFile, pickSaveFile, showError, showInfo } from "../ipc/dialog";
import {
  DEFAULT_META,
  readDocument,
  unwatchDocument,
  watchDocument,
  writeDocument,
  type DocumentMeta,
} from "../ipc/document";
import { describeError } from "../ipc/errors";
import type { FileChange } from "../ipc/events";
import { addRecentFile, removeRecentFile, setSidebarVisible, setTheme } from "../ipc/settings";
import { requestClose } from "../ipc/window";
import { minimalChange } from "./reload";

export interface SessionDeps {
  view: EditorView;
  banner: Banner;
  sidebar: Sidebar;
  theme: ThemeController;
  /** Called after a document was loaded into the editor (`setState` fires no update). */
  onLoad?: () => void;
}

export interface Session {
  readonly path: string | null;
  readonly dirty: boolean;
  /** Opens `path`, asking about unsaved changes first. */
  open(path: string): Promise<boolean>;
  newDocument(): Promise<boolean>;
  save(): Promise<boolean>;
  saveAs(): Promise<boolean>;
  /** Called by the window close handler; true means "go ahead and close". */
  confirmClose(): Promise<boolean>;
  /** Hook for `EditorView.updateListener`. */
  onEditorUpdate(update: ViewUpdate): void;
  /** Hook for the `file-changed` event (`ipc/events.ts`). */
  onFileChanged(change: FileChange): void;
}

export function createSession(deps: SessionDeps): Session {
  const { view, banner, sidebar, theme } = deps;
  let path: string | null = null;
  let meta: DocumentMeta = { ...DEFAULT_META };
  let savedDoc: Text = view.state.doc;
  let dirty = false;
  /** Modification time of the file as we last read or wrote it. */
  let knownMtime: number | null = null;

  const refreshTitle = (): void => {
    updateTitle(path, dirty);
  };

  const markSaved = (): void => {
    savedDoc = view.state.doc;
    dirty = false;
    refreshTitle();
  };

  const watch = (target: string | null): void => {
    const request = target === null ? unwatchDocument() : watchDocument(target);
    request.catch((err: unknown) => {
      console.warn("watchDocument failed", err);
    });
  };

  const load = (
    newPath: string | null,
    text: string,
    newMeta: DocumentMeta,
    mtime: number | null,
  ): void => {
    replaceDocument(view, text, theme.resolved === "dark", newPath);
    path = newPath;
    meta = newMeta;
    knownMtime = mtime;
    banner.hide();
    markSaved();
    deps.onLoad?.();
    watch(newPath);
    view.focus();
  };

  /** Re-reads the open file and applies the difference as one edit. */
  const reloadFromDisk = async (): Promise<void> => {
    if (path === null) {
      return;
    }
    const target = path;
    try {
      const doc = await readDocument(target);
      if (target !== path) {
        return;
      }
      meta = doc.meta;
      knownMtime = doc.mtimeMs;
      const change = minimalChange(view.state.doc.toString(), doc.text);
      if (change) {
        view.dispatch({ changes: change, userEvent: "reload" });
      }
      markSaved();
    } catch (err: unknown) {
      banner.show("error", `Could not reload "${fileName(target)}": ${describeError(err)}`);
    }
  };

  const writeTo = async (target: string): Promise<boolean> => {
    try {
      knownMtime = await writeDocument(target, view.state.doc.toString(), meta);
    } catch (err: unknown) {
      await showError("Save failed", `Could not save "${target}":\n${describeError(err)}`);
      return false;
    }
    if (target !== path) {
      path = target;
      setDocumentPath(view, target);
      watch(target);
    }
    banner.hide();
    markSaved();
    await addRecentFile(target).catch((err: unknown) => {
      console.warn("addRecentFile failed", err);
    });
    return true;
  };

  const saveAs = async (): Promise<boolean> => {
    const target = await pickSaveFile(path ?? "Untitled.md");
    if (target === null) {
      return false;
    }
    return writeTo(target);
  };

  const save = (): Promise<boolean> => (path === null ? saveAs() : writeTo(path));

  /** Resolves true when the current document may be replaced or closed. */
  const confirmDiscard = async (): Promise<boolean> => {
    if (!dirty) {
      return true;
    }
    const choice = await askUnsavedChanges(fileName(path));
    if (choice === "save") {
      return save();
    }
    return choice === "discard";
  };

  const open = async (target: string): Promise<boolean> => {
    if (target === path && !dirty) {
      return true;
    }
    if (!(await confirmDiscard())) {
      return false;
    }
    try {
      const doc = await readDocument(target);
      load(doc.path, doc.text, doc.meta, doc.mtimeMs);
      await addRecentFile(doc.path).catch((err: unknown) => {
        console.warn("addRecentFile failed", err);
      });
      return true;
    } catch (err: unknown) {
      banner.show("error", `Could not open "${target}": ${describeError(err)}`);
      await removeRecentFile(target).catch(() => undefined);
      return false;
    }
  };

  const newDocument = async (): Promise<boolean> => {
    if (!(await confirmDiscard())) {
      return false;
    }
    load(null, "", { ...DEFAULT_META }, null);
    return true;
  };

  const onFileChanged = (change: FileChange): void => {
    if (path === null || change.path !== path) {
      return;
    }
    if (change.mtimeMs !== null && change.mtimeMs === knownMtime) {
      return; // our own save
    }
    const name = fileName(path);
    if (change.mtimeMs === null) {
      banner.show("warning", `"${name}" was deleted or moved on disk. Save to write it again.`);
      return;
    }
    if (!dirty) {
      void reloadFromDisk();
      return;
    }
    banner.show("warning", `"${name}" changed on disk. Reload and lose your edits, or keep them?`, [
      { label: "Reload", run: () => void reloadFromDisk() },
      { label: "Keep", run: () => undefined },
    ]);
  };

  const fire = (work: () => Promise<unknown>): boolean => {
    work().catch((err: unknown) => {
      console.error("command failed", err);
    });
    return true;
  };

  defineCommand({ id: "file.new", title: "New", run: () => fire(newDocument) });
  defineCommand({
    id: "file.newWindow",
    title: "New Window",
    run: () => fire(() => openNewWindow()),
  });
  defineCommand({
    id: "file.open",
    title: "Open...",
    run: () =>
      fire(async () => {
        const target = await pickOpenFile();
        if (target !== null) {
          await open(target);
        }
      }),
  });
  defineCommand({ id: "file.save", title: "Save", run: () => fire(save) });
  defineCommand({ id: "file.saveAs", title: "Save As...", run: () => fire(saveAs) });
  defineCommand({ id: "file.exit", title: "Exit", run: () => fire(requestClose) });
  defineCommand({
    id: "view.toggleSidebar",
    title: "Toggle Sidebar",
    run: () => {
      sidebar.setVisible(!sidebar.visible);
      return fire(() => setSidebarVisible(sidebar.visible));
    },
  });
  for (const pref of ["light", "dark", "system"] as const) {
    defineCommand({
      id: `view.theme.${pref}`,
      title: `Theme: ${pref}`,
      run: () => {
        theme.set(pref);
        return fire(() => setTheme(pref));
      },
    });
  }
  defineCommand({
    id: "help.about",
    title: "About GCMD",
    run: () =>
      fire(async () => {
        const info = await appInfo();
        await showInfo(
          "About GCMD",
          [
            `${info.name} ${info.version}`,
            "A single-document GitHub Flavored Markdown editor.",
            "",
            `Free software under the GNU General Public License, version 3 or later, with an additional permission for elkjs (${info.license}), without any warranty.`,
            "",
            "Third-party licenses:",
            info.notices ?? "THIRD-PARTY-NOTICES.md in the installation folder",
          ].join("\n"),
        );
      }),
  });

  theme.onChange((resolved) => {
    setEditorDark(view, resolved === "dark");
  });

  refreshTitle();

  return {
    get path(): string | null {
      return path;
    },
    get dirty(): boolean {
      return dirty;
    },
    open,
    newDocument,
    save,
    saveAs,
    confirmClose: confirmDiscard,
    onFileChanged,
    onEditorUpdate(update): void {
      if (!update.docChanged) {
        return;
      }
      const nowDirty = !update.state.doc.eq(savedDoc);
      if (nowDirty !== dirty) {
        dirty = nowDirty;
        refreshTitle();
      }
    },
  };
}
