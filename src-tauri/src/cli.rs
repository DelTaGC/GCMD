//! Launch arguments and `file://` URLs (macOS `RunEvent::Opened`).

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// First argument that does not start with `-` (so Tauri and dev flags are
/// skipped), made absolute against `cwd` when relative. Empty arguments are
/// skipped. Returns `None` when there is no such argument.
pub fn file_argument<I: IntoIterator<Item = OsString>>(args: I, cwd: &Path) -> Option<PathBuf> {
    args.into_iter()
        .find(|arg| !arg.is_empty() && !arg.to_string_lossy().starts_with('-'))
        .map(|arg| {
            let path = PathBuf::from(arg);
            if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            }
        })
}

/// Strips the Windows verbatim prefix: `\\?\C:\x` becomes `C:\x` and
/// `\\?\UNC\server\share` becomes `\\server\share`. Other strings are
/// returned unchanged.
pub(crate) fn strip_verbatim(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        path.to_string()
    }
}

/// Normalizes a path for display and the recent list: canonicalizes when the
/// file exists (otherwise keeps the path as given) and strips the Windows
/// verbatim prefix.
pub fn display_path(path: &Path) -> String {
    let resolved = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    strip_verbatim(&resolved.to_string_lossy())
}

fn hex_value(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

pub(crate) fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hi = hex_value(*bytes.get(i + 1)?)?;
            let lo = hex_value(*bytes.get(i + 2)?)?;
            out.push(hi << 4 | lo);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Converts a `file://` URL to a path, percent-decoding it. On Windows the
/// slash before a drive letter is removed (`/C:/x` becomes `C:/x`). Returns
/// `None` for non-file URLs or malformed escapes.
pub fn path_from_file_url(url: &str) -> Option<PathBuf> {
    let rest = url.strip_prefix("file://")?;
    // Drop an optional host ("localhost" or empty); the path starts at '/'.
    let path_start = rest.find('/')?;
    let encoded = &rest[path_start..];
    let encoded = encoded.split(['?', '#']).next().unwrap_or(encoded);
    let decoded = percent_decode(encoded)?;
    if decoded.is_empty() {
        return None;
    }
    if cfg!(windows) {
        let bytes = decoded.as_bytes();
        if bytes.len() >= 3
            && bytes[0] == b'/'
            && bytes[1].is_ascii_alphabetic()
            && bytes[2] == b':'
        {
            return Some(PathBuf::from(&decoded[1..]));
        }
    }
    Some(PathBuf::from(decoded))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn os(args: &[&str]) -> Vec<OsString> {
        args.iter().map(OsString::from).collect()
    }

    #[test]
    fn flags_are_skipped() {
        let cwd = Path::new("base");
        let got = file_argument(os(&["--flag", "-x", "note.md"]), cwd);
        assert_eq!(got, Some(cwd.join("note.md")));
    }

    #[test]
    fn empty_and_missing_arguments_give_none() {
        let cwd = Path::new("base");
        assert_eq!(file_argument(os(&["", "--dev"]), cwd), None);
        assert_eq!(file_argument(Vec::new(), cwd), None);
    }

    #[test]
    fn empty_strings_are_skipped() {
        let cwd = Path::new("base");
        assert_eq!(
            file_argument(os(&["", "a.md"]), cwd),
            Some(cwd.join("a.md"))
        );
    }

    #[test]
    fn absolute_paths_are_kept() {
        let dir = tempfile::tempdir().unwrap();
        let abs = dir.path().join("a.md");
        let got = file_argument(vec![abs.clone().into_os_string()], Path::new("elsewhere"));
        assert_eq!(got, Some(abs));
    }

    #[test]
    fn strip_verbatim_handles_all_forms() {
        assert_eq!(strip_verbatim(r"\\?\C:\Users\me\a.md"), r"C:\Users\me\a.md");
        assert_eq!(
            strip_verbatim(r"\\?\UNC\srv\share\a.md"),
            r"\\srv\share\a.md"
        );
        assert_eq!(strip_verbatim(r"C:\plain.md"), r"C:\plain.md");
        assert_eq!(strip_verbatim("/unix/path"), "/unix/path");
    }

    #[test]
    fn display_path_canonicalizes_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.md");
        std::fs::write(&file, "x").unwrap();
        let shown = display_path(&file);
        assert!(!shown.starts_with(r"\\?\"));
        let expected = strip_verbatim(&file.canonicalize().unwrap().to_string_lossy());
        assert_eq!(shown, expected);
    }

    #[test]
    fn display_path_keeps_missing_path() {
        let missing = Path::new("definitely/not/here.md");
        assert_eq!(display_path(missing), missing.to_string_lossy());
    }

    #[test]
    fn file_url_decodes_percent_escapes() {
        let got = path_from_file_url("file:///home/me/my%20notes/%C3%A9.md").unwrap();
        assert_eq!(got, PathBuf::from("/home/me/my notes/\u{e9}.md"));
    }

    #[test]
    fn file_url_windows_drive() {
        let got = path_from_file_url("file:///C:/Users/me/a%20b.md").unwrap();
        if cfg!(windows) {
            assert_eq!(got, PathBuf::from("C:/Users/me/a b.md"));
        } else {
            assert_eq!(got, PathBuf::from("/C:/Users/me/a b.md"));
        }
    }

    #[test]
    fn file_url_accepts_localhost_host() {
        let got = path_from_file_url("file://localhost/tmp/a.md").unwrap();
        assert_eq!(got, PathBuf::from("/tmp/a.md"));
    }

    #[test]
    fn non_file_urls_and_bad_escapes_give_none() {
        assert_eq!(path_from_file_url("https://example.com/a.md"), None);
        assert_eq!(path_from_file_url("/plain/path"), None);
        assert_eq!(path_from_file_url("file:///bad%2"), None);
        assert_eq!(path_from_file_url("file:///bad%zz"), None);
    }
}
