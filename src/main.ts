/**
 * GCMD frontend bootstrap: settings -> theme -> editor -> session -> chrome
 * wiring -> open the launch file. No editing logic lives here.
 */
import type { ViewUpdate } from "@codemirror/view";
import { createSession } from "./app/session";
import { createBanner } from "./chrome/banner";
import { createSidebar } from "./chrome/sidebar";
import { createThemeController } from "./chrome/theme";
import { runCommand } from "./editor/commands";
import { createEditor } from "./editor/create";
import { launchArgs } from "./ipc/app";
import { onMenu, onOpenFile } from "./ipc/events";
import { getSettings, type Settings } from "./ipc/settings";
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
  const current = createSession({ view, banner, sidebar, theme });
  hooks.onUpdate = (update) => {
    current.onEditorUpdate(update);
  };

  if (import.meta.env.DEV) {
    // Debug handle for the browser console and automated UI checks.
    Object.assign(window, { gcmd: { view, session: current } });
  }
  if (!isTauri()) {
    // Plain browser (`npm run dev`): no menu, no files; the editor still works.
    view.focus();
    return;
  }

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
  await onFilesDropped((paths) => {
    const first = paths[0];
    if (first !== undefined) {
      void current.open(first);
    }
  });
  await onCloseRequested(() => current.confirmClose());

  const initial = await launchArgs();
  if (initial !== null) {
    await current.open(initial);
  }
  view.focus();
}

bootstrap().catch((err: unknown) => {
  console.error("bootstrap failed", err);
});
