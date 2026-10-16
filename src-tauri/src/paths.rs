//! Resolving markdown link destinations (images, `.md` links) to files on disk.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::cli;
use crate::error::AppError;

/// Directory containing the document at `base`.
pub fn parent_dir(base: &Path) -> Option<PathBuf> {
    base.parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf)
}

/// Returns the URL scheme of `href` (lowercase), if it has one. A single
/// letter followed by `:` is a Windows drive, not a scheme.
fn scheme(href: &str) -> Option<String> {
    let colon = href.find(':')?;
    let candidate = &href[..colon];
    let mut chars = candidate.chars();
    let first = chars.next()?;
    let valid = first.is_ascii_alphabetic()
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
    (valid && candidate.len() >= 2).then(|| candidate.to_ascii_lowercase())
}

/// Resolves a markdown link destination against the directory of the document at `base`.
///
/// The `#fragment` and `?query` are dropped and percent-escapes decoded.
/// `file://` URLs and absolute paths are used as-is; relative paths are joined
/// onto the directory of `base`. `~` is not expanded. The result is canonical
/// (without the Windows verbatim prefix) and is guaranteed to be an existing
/// regular file.
pub fn resolve_href(base: Option<&Path>, href: &str) -> Result<PathBuf, AppError> {
    let href = href.trim();
    let target = href.split(['?', '#']).next().unwrap_or(href);
    if target.is_empty() {
        return Err(AppError::InvalidPath("empty link destination".into()));
    }

    let candidate = match scheme(target).as_deref() {
        Some("file") => cli::path_from_file_url(target)
            .ok_or_else(|| AppError::InvalidPath(format!("malformed file URL: {target}")))?,
        Some(other) => {
            return Err(AppError::InvalidPath(format!(
                "unsupported link scheme `{other}:`"
            )));
        }
        None => {
            // A literal `%` that is not an escape (`100%.png`) is kept as written.
            let decoded = cli::percent_decode(target).unwrap_or_else(|| target.to_string());
            let path = PathBuf::from(decoded);
            if path.is_absolute() {
                path
            } else {
                let dir = base.and_then(parent_dir).ok_or_else(|| {
                    AppError::InvalidPath(format!(
                        "cannot resolve relative link `{target}` without a saved document"
                    ))
                })?;
                dir.join(path)
            }
        }
    };

    let canonical = candidate.canonicalize().map_err(|e| {
        AppError::Io(format!(
            "cannot open {}: {e}",
            cli::strip_verbatim(&candidate.to_string_lossy())
        ))
    })?;
    let display = cli::strip_verbatim(&canonical.to_string_lossy());
    if !canonical.is_file() {
        return Err(AppError::Io(format!("not a file: {display}")));
    }
    Ok(PathBuf::from(display))
}

/// One entry of a directory listing, for link-destination completion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
}

/// Most entries `list_dir` returns; a huge directory is cut, not refused.
pub const MAX_DIR_ENTRIES: usize = 2000;

/// Lists the directory part of a link destination being typed (`""`,
/// `docs/`, `../img/`, `C:/x/`), resolved like `resolve_href`: percent-escapes
/// decoded, absolute paths as-is, relative ones against the directory of the
/// document at `base`. Not recursive. Directories come first, then names in
/// case-insensitive order; symlinks count as what they point to; names that
/// are not valid UTF-8 are skipped.
pub fn list_dir(base: Option<&Path>, dir: &str) -> Result<Vec<DirEntry>, AppError> {
    if let Some(other) = scheme(dir) {
        return Err(AppError::InvalidPath(format!(
            "unsupported link scheme `{other}:`"
        )));
    }
    let decoded = cli::percent_decode(dir).unwrap_or_else(|| dir.to_string());
    let path = PathBuf::from(decoded);
    let target = if path.is_absolute() {
        path
    } else {
        let doc_dir = base.and_then(parent_dir).ok_or_else(|| {
            AppError::InvalidPath(format!("cannot list `{dir}` without a saved document"))
        })?;
        doc_dir.join(path)
    };

    let mut entries: Vec<DirEntry> = std::fs::read_dir(&target)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let is_dir = entry.path().is_dir();
            let name = entry.file_name().into_string().ok()?;
            Some(DirEntry { name, is_dir })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries.truncate(MAX_DIR_ENTRIES);
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(path: &Path) {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).unwrap();
        }
        fs::write(path, b"x").unwrap();
    }

    fn expected(path: &Path) -> PathBuf {
        PathBuf::from(cli::display_path(path))
    }

    #[test]
    fn resolves_relative_to_document_directory() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("notes").join("doc.md");
        let img = dir.path().join("notes").join("a.png");
        touch(&doc);
        touch(&img);
        assert_eq!(resolve_href(Some(&doc), "a.png").unwrap(), expected(&img));
        assert_eq!(resolve_href(Some(&doc), "./a.png").unwrap(), expected(&img));
    }

    #[test]
    fn resolves_parent_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("notes").join("doc.md");
        let img = dir.path().join("img").join("a.png");
        touch(&doc);
        touch(&img);
        assert_eq!(
            resolve_href(Some(&doc), "../img/a.png").unwrap(),
            expected(&img)
        );
    }

    #[test]
    fn decodes_percent_escapes() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        let img = dir.path().join("my image.png");
        touch(&img);
        assert_eq!(
            resolve_href(Some(&doc), "my%20image.png").unwrap(),
            expected(&img)
        );
    }

    #[test]
    fn keeps_a_literal_percent_that_is_not_an_escape() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        let img = dir.path().join("100%.png");
        touch(&img);
        assert_eq!(
            resolve_href(Some(&doc), "100%.png").unwrap(),
            expected(&img)
        );
    }

    #[test]
    fn strips_query_and_fragment() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        let img = dir.path().join("a.png");
        touch(&img);
        let want = expected(&img);
        assert_eq!(resolve_href(Some(&doc), "a.png?raw=true").unwrap(), want);
        assert_eq!(resolve_href(Some(&doc), "a.png#top").unwrap(), want);
        assert_eq!(resolve_href(Some(&doc), "a.png?v=1#top").unwrap(), want);
    }

    #[test]
    fn accepts_absolute_paths() {
        let dir = tempfile::tempdir().unwrap();
        let img = dir.path().join("abs.png");
        touch(&img);
        let href = img.to_string_lossy().into_owned();
        assert_eq!(resolve_href(None, &href).unwrap(), expected(&img));
    }

    #[test]
    fn accepts_file_urls() {
        let dir = tempfile::tempdir().unwrap();
        let img = dir.path().join("url image.png");
        touch(&img);
        let plain = cli::display_path(&img)
            .replace('\\', "/")
            .replace(' ', "%20");
        let url = if plain.starts_with('/') {
            format!("file://{plain}")
        } else {
            format!("file:///{plain}")
        };
        assert_eq!(resolve_href(None, &url).unwrap(), expected(&img));
    }

    #[test]
    fn missing_file_is_io_error() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        let err = resolve_href(Some(&doc), "nope.png").unwrap_err();
        assert!(matches!(err, AppError::Io(_)), "{err:?}");
    }

    #[test]
    fn directory_is_not_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        fs::create_dir(dir.path().join("sub")).unwrap();
        let err = resolve_href(Some(&doc), "sub").unwrap_err();
        assert!(
            matches!(err, AppError::Io(ref m) if m.contains("not a file")),
            "{err:?}"
        );
    }

    #[test]
    fn relative_without_base_is_invalid_path() {
        let err = resolve_href(None, "a.png").unwrap_err();
        assert!(matches!(err, AppError::InvalidPath(_)), "{err:?}");
    }

    #[test]
    fn other_schemes_are_invalid_path() {
        for href in [
            "https://example.com/a.png",
            "mailto:me@example.com",
            "data:image/png;base64,AAAA",
        ] {
            let err = resolve_href(None, href).unwrap_err();
            assert!(matches!(err, AppError::InvalidPath(_)), "{href}: {err:?}");
        }
    }

    #[test]
    fn empty_href_is_invalid_path() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        for href in ["", "   ", "#top", "?q=1"] {
            let err = resolve_href(Some(&doc), href).unwrap_err();
            assert!(matches!(err, AppError::InvalidPath(_)), "{href}: {err:?}");
        }
    }

    #[test]
    fn tilde_is_not_expanded() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        let err = resolve_href(Some(&doc), "~/a.png").unwrap_err();
        assert!(matches!(err, AppError::Io(_)), "{err:?}");
    }

    #[test]
    fn drive_letters_are_not_schemes() {
        assert_eq!(scheme(r"C:\abs\x.png"), None);
        assert_eq!(scheme("C:/x.png"), None);
        assert_eq!(scheme("file:///x"), Some("file".into()));
        assert_eq!(scheme("a.png"), None);
    }

    fn names(entries: &[DirEntry]) -> Vec<(&str, bool)> {
        entries
            .iter()
            .map(|e| (e.name.as_str(), e.is_dir))
            .collect()
    }

    #[test]
    fn lists_document_directory_dirs_first() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        touch(&doc);
        touch(&dir.path().join("b.png"));
        touch(&dir.path().join("A.md"));
        fs::create_dir(dir.path().join("zeta")).unwrap();
        fs::create_dir(dir.path().join("Alpha")).unwrap();
        let entries = list_dir(Some(&doc), "").unwrap();
        assert_eq!(
            names(&entries),
            vec![
                ("Alpha", true),
                ("zeta", true),
                ("A.md", false),
                ("b.png", false),
                ("doc.md", false),
            ]
        );
    }

    #[test]
    fn lists_relative_parent_and_encoded_directories() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("notes").join("doc.md");
        touch(&doc);
        touch(&dir.path().join("my img").join("a.png"));
        let up = list_dir(Some(&doc), "../").unwrap();
        assert_eq!(names(&up), vec![("my img", true), ("notes", true)]);
        let inner = list_dir(Some(&doc), "../my%20img/").unwrap();
        assert_eq!(names(&inner), vec![("a.png", false)]);
        if cfg!(windows) {
            let backslash = list_dir(Some(&doc), r"..\my img\").unwrap();
            assert_eq!(names(&backslash), vec![("a.png", false)]);
        }
    }

    #[test]
    fn lists_absolute_directory_without_document() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("x.md"));
        let abs = format!("{}/", dir.path().to_string_lossy());
        assert_eq!(names(&list_dir(None, &abs).unwrap()), vec![("x.md", false)]);
    }

    #[test]
    fn listing_errors() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("doc.md");
        touch(&doc);
        assert!(matches!(
            list_dir(None, "sub/").unwrap_err(),
            AppError::InvalidPath(_)
        ));
        assert!(matches!(
            list_dir(Some(&doc), "https://example.com/").unwrap_err(),
            AppError::InvalidPath(_)
        ));
        assert!(matches!(
            list_dir(Some(&doc), "missing/").unwrap_err(),
            AppError::Io(_)
        ));
        assert!(matches!(
            list_dir(Some(&doc), "doc.md").unwrap_err(),
            AppError::Io(_)
        ));
    }

    #[test]
    fn parent_dir_of_bare_filename_is_none() {
        assert_eq!(parent_dir(Path::new("doc.md")), None);
        assert_eq!(parent_dir(Path::new("a/doc.md")), Some(PathBuf::from("a")));
    }
}
