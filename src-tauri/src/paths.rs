//! Resolving markdown link destinations (images, `.md` links) to files on disk.

use std::path::{Path, PathBuf};

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

    #[test]
    fn parent_dir_of_bare_filename_is_none() {
        assert_eq!(parent_dir(Path::new("doc.md")), None);
        assert_eq!(parent_dir(Path::new("a/doc.md")), Some(PathBuf::from("a")));
    }
}
