//! Self-update through `tauri-plugin-updater` (ADR 0010).
//!
//! The plugin is driven from Rust and exposed as our own commands so the
//! frontend never holds the generic updater permissions. A checked update is
//! kept here until the user asks to install it.
//!
//! On Windows the NSIS installer runs in passive mode, which force-closes
//! every process running the installed exe (Restart Manager). Other GCMD
//! windows may hold unsaved work, so the frontend asks [`other_instances`]
//! first and installation refuses while any are open.

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::AppError;

/// What the frontend learns about an available update.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    /// Release notes from the manifest, if any.
    pub notes: Option<String>,
}

impl From<&Update> for UpdateInfo {
    fn from(update: &Update) -> Self {
        Self {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone().filter(|n| !n.trim().is_empty()),
        }
    }
}

/// Download progress, emitted as the `update-progress` event.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// The update found by the last check, waiting for the user to install it.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

impl PendingUpdate {
    fn set(&self, update: Option<Update>) -> Result<(), AppError> {
        *self
            .0
            .lock()
            .map_err(|_| AppError::Internal("update lock poisoned".into()))? = update;
        Ok(())
    }

    fn take(&self) -> Result<Option<Update>, AppError> {
        Ok(self
            .0
            .lock()
            .map_err(|_| AppError::Internal("update lock poisoned".into()))?
            .take())
    }
}

fn update_error(err: &tauri_plugin_updater::Error) -> AppError {
    AppError::Update(err.to_string())
}

/// Asks the configured endpoint for a newer version and remembers it.
pub async fn check<R: Runtime>(
    app: &AppHandle<R>,
    pending: &PendingUpdate,
) -> Result<Option<UpdateInfo>, AppError> {
    let update = app
        .updater()
        .map_err(|e| update_error(&e))?
        .check()
        .await
        .map_err(|e| update_error(&e))?;
    let info = update.as_ref().map(UpdateInfo::from);
    pending.set(update)?;
    Ok(info)
}

/// Downloads, verifies and installs the pending update, then restarts.
///
/// On Windows the installer takes over and this process exits inside the
/// plugin; elsewhere the bundle is replaced in place and the app restarts.
pub async fn install<R: Runtime>(
    app: &AppHandle<R>,
    pending: &PendingUpdate,
) -> Result<(), AppError> {
    let others = other_instances();
    if others > 0 {
        return Err(AppError::Update(format!(
            "{others} other GCMD window(s) are open; close them before installing."
        )));
    }
    let Some(update) = pending.take()? else {
        return Err(AppError::Update("No update is pending.".into()));
    };
    let mut progress = ProgressThrottle::default();
    let result = update
        .download_and_install(
            |chunk, total| {
                if let Some(event) = progress.advance(chunk, total)
                    && let Err(e) = app.emit("update-progress", event)
                {
                    eprintln!("update-progress emit failed: {e}");
                }
            },
            || {},
        )
        .await;
    if let Err(e) = result {
        // Keep the update so the user can retry without checking again.
        pending.set(Some(update))?;
        return Err(update_error(&e));
    }
    app.restart();
}

/// Turns download chunks into at most ~100 progress events.
#[derive(Debug, Default)]
struct ProgressThrottle {
    downloaded: u64,
    last_percent: Option<u64>,
}

impl ProgressThrottle {
    fn advance(&mut self, chunk: usize, total: Option<u64>) -> Option<UpdateProgress> {
        self.downloaded += u64::try_from(chunk).unwrap_or(u64::MAX);
        let percent = total
            .filter(|t| *t > 0)
            .map(|t| self.downloaded.min(t) * 100 / t);
        if percent.is_some() && percent == self.last_percent {
            return None;
        }
        self.last_percent = percent;
        Some(UpdateProgress {
            downloaded: self.downloaded,
            total,
        })
    }
}

/// Counts processes in `processes` (pid, executable) other than `own_pid`
/// whose executable has the same file name as `own_exe` (case-insensitive on
/// Windows).
///
/// The file name, not the full path, on purpose: the same file can be seen
/// under different paths (8.3 short names, junctions, the per-package
/// `LocalCache` redirection of MSIX-packaged parents), and missing a window
/// loses its unsaved work while counting a stray dev build only asks the
/// user to close it.
pub fn count_same_exe<'a>(
    processes: impl IntoIterator<Item = (u32, Option<&'a Path>)>,
    own_pid: u32,
    own_exe: &Path,
) -> usize {
    let Some(own_name) = own_exe.file_name().map(|n| n.to_string_lossy()) else {
        return 0;
    };
    let same = |exe: &Path| {
        exe.file_name().is_some_and(|name| {
            let name = name.to_string_lossy();
            if cfg!(windows) {
                name.eq_ignore_ascii_case(&own_name)
            } else {
                name == own_name
            }
        })
    };
    processes
        .into_iter()
        .filter(|(pid, exe)| *pid != own_pid && exe.is_some_and(same))
        .count()
}

/// Number of other GCMD processes (same executable name). Only Windows
/// needs this (see the module docs); other platforms report 0.
#[cfg(windows)]
pub fn other_instances() -> usize {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

    let Ok(own_exe) = std::env::current_exe() else {
        return 0;
    };
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );
    count_same_exe(
        system
            .processes()
            .iter()
            .map(|(pid, process)| (pid.as_u32(), process.exe())),
        std::process::id(),
        &own_exe,
    )
}

/// Number of other GCMD processes (same executable name). Only Windows
/// needs this (see the module docs); other platforms report 0.
#[cfg(not(windows))]
pub fn other_instances() -> usize {
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn counts_other_processes_of_the_same_exe() {
        let own = PathBuf::from("/apps/gcmd");
        let other = PathBuf::from("/apps/other");
        let processes = [
            (1, Some(own.as_path())),
            (2, Some(own.as_path())),
            (3, Some(other.as_path())),
            (4, None),
            (5, Some(own.as_path())),
        ];
        assert_eq!(count_same_exe(processes, 1, &own), 2);
        assert_eq!(count_same_exe([(1, Some(own.as_path()))], 1, &own), 0);
    }

    #[test]
    fn the_same_exe_seen_under_another_path_counts() {
        // Seen from inside an MSIX-packaged parent, %LOCALAPPDATA% is redirected.
        let own = PathBuf::from("/home/u/AppData/Local/GCMD/gcmd");
        let redirected =
            PathBuf::from("/home/u/AppData/Local/Packages/X/LocalCache/Local/GCMD/gcmd");
        assert_eq!(
            count_same_exe([(7, Some(redirected.as_path()))], 1, &own),
            1
        );
    }

    #[cfg(windows)]
    #[test]
    fn exe_comparison_ignores_case_on_windows() {
        let own = PathBuf::from(r"C:\Apps\GCMD\GCMD.exe");
        let lower = PathBuf::from(r"c:\apps\gcmd\gcmd.exe");
        assert_eq!(count_same_exe([(9, Some(lower.as_path()))], 1, &own), 1);
    }

    #[test]
    fn progress_is_throttled_to_percent_steps() {
        let mut throttle = ProgressThrottle::default();
        let total = Some(1000);
        assert_eq!(
            throttle.advance(5, total),
            Some(UpdateProgress {
                downloaded: 5,
                total
            })
        );
        // Still 0 %: suppressed.
        assert_eq!(throttle.advance(4, total), None);
        assert_eq!(throttle.advance(1, total).map(|p| p.downloaded), Some(10));
        assert_eq!(
            throttle.advance(990, total).map(|p| p.downloaded),
            Some(1000)
        );
    }

    #[test]
    fn progress_without_total_reports_every_chunk() {
        let mut throttle = ProgressThrottle::default();
        assert!(throttle.advance(10, None).is_some());
        assert!(throttle.advance(10, None).is_some());
    }
}
