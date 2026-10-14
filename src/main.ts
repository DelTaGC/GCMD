/**
 * GCMD frontend bootstrap: settings -> theme -> editor -> session -> chrome
 * wiring -> open the launch file. No editing logic lives here.
 */
import type { ViewUpdate } from "@codemirror/view";
import { createOutlineController } from "./app/outline";
import { createSession } from "./app/session";
import { createUpdateController } from "./app/updates";
import { createWrapController } from "./app/wrap";
import { createBanner } from "./chrome/banner";
import { installMenuMnemonics } from "./chrome/menuKeys";
import { createSidebar } from "./chrome/sidebar";
import { createThemeController } from "./chrome/theme";
import { runCommand } from "./editor/commands";
import { createEditor, replaceDocument } from "./editor/create";
import { launchArgs } from "./ipc/app";
import { onFileChanged, onMenu, onOpenFile } from "./ipc/events";
import { getSettings, setWrap, type Settings } from "./ipc/settings";
import { isTauri } from "./ipc/env";
import { onCloseRequested, onFilesDropped } from "./ipc/window";

const RECENT_PREFIX = "recent:";

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing #${id} element`);
  }
  return element;
}

const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 0,
  theme: "system",
  recentFiles: [],
  sidebarVisible: false,
  updates: { check: "auto", lastCheckMs: null, skippedVersion: null },
  wrap: { mode: "full", width: 832, margin: 40 },
};

async function loadSettings(): Promise<Settings> {
  if (!isTauri()) {
    return DEFAULT_SETTINGS;
  }
  try {
    return await getSettings();
  } catch (err: unknown) {
    console.warn("settings unavailable, using defaults", err);
    return DEFAULT_SETTINGS;
  }
}

async function bootstrap(): Promise<void> {
  const host = requireElement("editor");
  const sidebarHost = requireElement("sidebar");
  const settings = await loadSettings();

  const theme = createThemeController(settings.theme);
  const banner = createBanner();
  host.before(banner.element);
  const sidebar = createSidebar(sidebarHost, settings.sidebarVisible);

  // The session needs the view and the view's update listener needs the
  // session, so the listener is looked up through this holder.
  const hooks: { onUpdate?: (update: ViewUpdate) => void } = {};
  const view = createEditor({
    parent: host,
    doc: "",
    dark: theme.resolved === "dark",
    onUpdate: (update) => hooks.onUpdate?.(update),
  });
  const outline = createOutlineController(view, sidebar);
  const wrap = createWrapController({
    view,
    initial: settings.wrap,
    persist: (next) => (isTauri() ? setWrap(next) : Promise.resolve()),
  });
  host.after(wrap.bar.element);
  const current = createSession({
    view,
    banner,
    sidebar,
    theme,
    onLoad: () => {
      outline.refresh();
      wrap.refresh();
    },
  });
  hooks.onUpdate = (update) => {
    current.onEditorUpdate(update);
    outline.onEditorUpdate(update);
  };

  if (import.meta.env.DEV) {
    // Debug handle for the browser console and automated UI checks
    // (`replaceDocument` loads text without IPC, see docs/perf.md).
    Object.assign(window, {
      gcmd: { view, session: current, outline, sidebar, banner, wrap, replaceDocument },
    });
  }
  if (!isTauri()) {
    // Plain browser (`npm run dev`): no menu, no files; the editor still works.
    view.focus();
    return;
  }

  installMenuMnemonics();
  await onMenu((id) => {
    if (id.startsWith(RECENT_PREFIX)) {
      void current.open(id.slice(RECENT_PREFIX.length));
      return;
    }
    runCommand(id, view);
  });
  await onOpenFile((path) => {
    void current.open(path);
  });
  await onFileChanged((change) => {
    current.onFileChanged(change);
  });
  await onFilesDropped((paths) => {
    const first = paths[0];
    if (first !== undefined) {
      void current.open(first);
    }
  });
  await onCloseRequested(() => current.confirmClose());

  const updates = createUpdateController({
    banner,
    confirmClose: () => current.confirmClose(),
    updates: settings.updates,
  });

  const initial = await launchArgs();
  if (initial !== null) {
    await current.open(initial);
  }
  view.focus();
  // Dev builds never self-update (the version in a dev build is not a release).
  if (!import.meta.env.DEV) {
    updates.scheduleStartupCheck();
  }
}

bootstrap().catch((err: unknown) => {
  console.error("bootstrap failed", err);
});
