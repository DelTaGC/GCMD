/**
 * Self-update flow (ADR 0010): a quiet background check after startup, the
 * Help > Check for Updates command, and the banner that offers the update.
 *
 * Installing restarts the app, so unsaved changes go through the session's
 * usual prompt first. On Windows the installer would force-close every other
 * GCMD window, so installation waits until they are closed.
 */
import type { Banner } from "../chrome/banner";
import { defineCommand } from "../editor/commands";
import { appInfo } from "../ipc/app";
import { showError, showInfo } from "../ipc/dialog";
import { describeError } from "../ipc/errors";
import type { UpdateSettings } from "../ipc/settings";
import {
  onUpdateProgress,
  setAutoUpdate,
  updateCheck,
  updateInstall,
  updateOtherInstances,
  updateSkip,
  type UpdateInfo,
} from "../ipc/updates";
import {
  STARTUP_DELAY_MS,
  otherWindowsText,
  progressText,
  shouldAnnounce,
  shouldAutoCheck,
} from "./updatePolicy";

export interface UpdateDeps {
  banner: Banner;
  /** The session's unsaved-changes prompt; true means the document may go. */
  confirmClose: () => Promise<boolean>;
  updates: UpdateSettings;
}

export interface UpdateController {
  /** Schedules the automatic check, if enabled and due. */
  scheduleStartupCheck(): void;
}

export function createUpdateController(deps: UpdateDeps): UpdateController {
  const { banner, confirmClose } = deps;
  let updates = deps.updates;
  let busy = false;

  const install = async (info: UpdateInfo): Promise<void> => {
    const others = await updateOtherInstances();
    if (others > 0) {
      banner.show("warning", otherWindowsText(others), [
        { label: "Try Again", run: () => void install(info) },
      ]);
      return;
    }
    if (!(await confirmClose())) {
      announce(info);
      return;
    }
    banner.show("info", progressText(info.version, null));
    const unlisten = await onUpdateProgress((progress) => {
      banner.show("info", progressText(info.version, progress));
    });
    try {
      // Restarts the app on success, so nothing after this runs.
      await updateInstall();
    } catch (err: unknown) {
      banner.show("error", `Could not install GCMD ${info.version}: ${describeError(err)}`, [
        { label: "Try Again", run: () => void install(info) },
      ]);
    } finally {
      unlisten();
    }
  };

  const announce = (info: UpdateInfo): void => {
    const actions = [
      { label: "Install and Restart", run: () => void install(info) },
      ...(info.notes === null
        ? []
        : [
            {
              label: "Release Notes",
              run: () =>
                void showInfo(`GCMD ${info.version}`, info.notes ?? "").then(() => {
                  announce(info);
                }),
            },
          ]),
      {
        label: "Skip This Version",
        run: () =>
          void updateSkip(info.version).then((settings) => {
            updates = settings.updates;
          }),
      },
    ];
    banner.show(
      "info",
      `GCMD ${info.version} is available (you have ${info.currentVersion}).`,
      actions,
    );
  };

  const check = async (manual: boolean): Promise<void> => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      const info = await updateCheck();
      if (info === null) {
        if (manual) {
          const current = await appInfo();
          await showInfo("No updates", `GCMD ${current.version} is the latest version.`);
        }
        return;
      }
      // An automatic check never covers a banner the user still has to act on.
      if (shouldAnnounce(info.version, updates, manual) && (manual || !banner.visible)) {
        announce(info);
      }
    } catch (err: unknown) {
      if (manual) {
        await showError("Check for updates", `Could not check for updates: ${describeError(err)}`);
      } else {
        console.warn("update check failed", err);
      }
    } finally {
      busy = false;
    }
  };

  const fire = (work: () => Promise<unknown>): boolean => {
    work().catch((err: unknown) => {
      console.error("command failed", err);
    });
    return true;
  };

  defineCommand({
    id: "help.checkUpdates",
    title: "Check for Updates...",
    run: () => fire(() => check(true)),
  });
  defineCommand({
    id: "help.autoUpdate",
    title: "Check for Updates Automatically",
    run: () =>
      fire(async () => {
        updates = (await setAutoUpdate(updates.check !== "auto")).updates;
      }),
  });

  return {
    scheduleStartupCheck(): void {
      if (!shouldAutoCheck(updates, Date.now())) {
        return;
      }
      setTimeout(() => void check(false), STARTUP_DELAY_MS);
    },
  };
}
