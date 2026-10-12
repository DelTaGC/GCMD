/**
 * The document session: which file is open, its save metadata, the dirty
 * state, and the open / save / new / close flows. It registers the `file.*`,
 * `view.*` and `help.*` commands in the registry so menus and shortcuts run
 * them like any editing command.
 *
 * Dirty is computed by comparing the buffer with the last saved text, so
 * undoing back to the saved state clears the marker.
 */
import type { Text } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { Banner } from "../chrome/banner";
import type { Sidebar } from "../chrome/sidebar";
import type { ThemeController } from "../chrome/theme";
import { fileName, updateTitle } from "../chrome/title";
import { defineCommand } from "../editor/commands";
import { replaceDocument } from "../editor/create";
import { setEditorDark } from "../editor/theme";
import { appInfo, openNewWindow } from "../ipc/app";
import { askUnsavedChanges, pickOpenFile, pickSaveFile, showError, showInfo } from "../ipc/dialog";
import { DEFAULT_META, readDocument, writeDocument, type DocumentMeta } from "../ipc/document";
import { describeError } from "../ipc/errors";
import { addRecentFile, removeRecentFile, setSidebarVisible, setTheme } from "../ipc/settings";
import { requestClose } from "../ipc/window";

export interface SessionDeps {
  view: EditorView;
  banner: Banner;
  sidebar: Sidebar;
  theme: ThemeController;
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
}

export function createSession(deps: SessionDeps): Session {
  const { view, banner, sidebar, theme } = deps;
  let path: string | null = null;
  let meta: DocumentMeta = { ...DEFAULT_META };
  let savedDoc: Text = view.state.doc;
  let dirty = false;

  const refreshTitle = (): void => {
    updateTitle(path, dirty);
  };

  const markSaved = (): void => {
    savedDoc = view.state.doc;
    dirty = false;
    refreshTitle();
  };

  const load = (newPath: string | null, text: string, newMeta: DocumentMeta): void => {
    replaceDocument(view, text, theme.resolved === "dark");
    path = newPath;
    meta = newMeta;
    banner.hide();
    markSaved();
    view.focus();
  };

  const writeTo = async (target: string): Promise<boolean> => {
    try {
      await writeDocument(target, view.state.doc.toString(), meta);
    } catch (err: unknown) {
      await showError("Save failed", `Could not save "${target}":\n${describeError(err)}`);
      return false;
    }
    path = target;
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
      load(doc.path, doc.text, doc.meta);
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
    load(null, "", { ...DEFAULT_META });
    return true;
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
          `${info.name} ${info.version}\nA single-document GitHub Flavored Markdown editor.`,
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
