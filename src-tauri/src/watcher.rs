//! Watches the open document for changes made by other programs.
//!
//! The parent directory is watched (non-recursively) rather than the file
//! itself: editors that save by writing a temporary file and renaming it
//! over the original would otherwise detach the watch. Events are debounced
//! so one save produces one [`FileChange`]. The frontend decides what to do
//! with it: it ignores the change when the modification time is the one it
//! produced itself, reloads silently when the buffer is clean, and shows a
//! banner when the buffer is dirty.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use serde::Serialize;

use crate::document;
use crate::error::AppError;

/// Quiet period after the last filesystem event before a change is reported.
pub const DEBOUNCE: Duration = Duration::from_millis(200);

/// Payload of the `file-changed` event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    /// The watched path, as it was given to [`watch`].
    pub path: String,
    /// Current modification time in milliseconds, `None` when the file no
    /// longer exists.
    pub mtime_ms: Option<u64>,
}

/// A running watch on one document; dropping it stops the watch.
pub struct DocumentWatcher {
    // Kept alive for its `Drop`, which stops the background thread.
    _debouncer: Debouncer<RecommendedWatcher>,
    path: PathBuf,
}

impl DocumentWatcher {
    /// The document this watcher reports on.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// Compares file names the way the platform does: case-insensitively on
/// Windows, exactly elsewhere.
#[must_use]
pub fn same_file_name(a: &OsStr, b: &OsStr) -> bool {
    if cfg!(windows) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// Starts watching `path` and calls `on_change` (from a background thread)
/// after every debounced change to that file.
pub fn watch(
    path: &Path,
    on_change: impl Fn(FileChange) + Send + 'static,
) -> Result<DocumentWatcher, AppError> {
    let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) else {
        return Err(AppError::InvalidPath(format!(
            "Cannot watch a path without a directory: {}",
            path.display()
        )));
    };
    let Some(name) = path.file_name().map(OsStr::to_os_string) else {
        return Err(AppError::InvalidPath(format!(
            "Cannot watch a path without a file name: {}",
            path.display()
        )));
    };
    let watched = path.to_path_buf();
    let reported = path.to_string_lossy().into_owned();
    let handler = move |result: DebounceEventResult| {
        let Ok(events) = result else {
            return;
        };
        let touched = events
            .iter()
            .any(|e| e.path.file_name().is_some_and(|n| same_file_name(n, &name)));
        if touched {
            on_change(FileChange {
                path: reported.clone(),
                mtime_ms: document::mtime_ms(&watched).ok(),
            });
        }
    };
    let mut debouncer =
        new_debouncer(DEBOUNCE, handler).map_err(|e| AppError::Io(e.to_string()))?;
    debouncer
        .watcher()
        .watch(parent, RecursiveMode::NonRecursive)
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(DocumentWatcher {
        _debouncer: debouncer,
        path: path.to_path_buf(),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::mpsc;

    use super::*;

    const WAIT: Duration = Duration::from_secs(5);

    #[test]
    fn file_names_compare_per_platform() {
        assert!(same_file_name(OsStr::new("a.md"), OsStr::new("a.md")));
        assert!(!same_file_name(OsStr::new("a.md"), OsStr::new("b.md")));
        assert_eq!(
            same_file_name(OsStr::new("A.md"), OsStr::new("a.md")),
            cfg!(windows)
        );
    }

    #[test]
    fn rejects_paths_without_directory_or_name() {
        assert!(matches!(
            watch(Path::new("alone.md"), |_| {}),
            Err(AppError::InvalidPath(_))
        ));
        assert!(matches!(
            watch(Path::new("/"), |_| {}),
            Err(AppError::InvalidPath(_))
        ));
    }

    #[test]
    fn reports_modification_and_deletion_of_the_watched_file_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let other = dir.path().join("other.md");
        fs::write(&path, "one\n").unwrap();
        let (tx, rx) = mpsc::channel();
        let watcher = watch(&path, move |change| {
            let _ = tx.send(change);
        })
        .unwrap();
        assert_eq!(watcher.path(), path);

        // Settle: some platforms report the directory itself right after the watch starts.
        std::thread::sleep(Duration::from_millis(300));
        fs::write(&other, "noise\n").unwrap();
        fs::write(&path, "two\n").unwrap();
        let change = rx.recv_timeout(WAIT).expect("modification reported");
        assert_eq!(change.path, path.to_string_lossy());
        assert!(change.mtime_ms.is_some());

        fs::remove_file(&path).unwrap();
        let change = rx.recv_timeout(WAIT).expect("deletion reported");
        assert_eq!(change.mtime_ms, None);

        drop(watcher);
        fs::write(&path, "three\n").unwrap();
        assert!(rx.recv_timeout(Duration::from_millis(800)).is_err());
    }
}
