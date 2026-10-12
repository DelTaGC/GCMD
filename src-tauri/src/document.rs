//! Byte-faithful document I/O (see `docs/decisions/0005-save-fidelity.md`).
//!
//! A file is decoded to LF-only text plus [`DocumentMeta`] describing how it
//! was stored (BOM, dominant line ending). Encoding the text with that meta
//! reproduces the original bytes when the text is unchanged.

use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// Line-ending convention of a file on disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    /// `\n`
    Lf,
    /// `\r\n`
    CrLf,
}

/// How a document was stored on disk; needed to save it back faithfully.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMeta {
    /// Dominant line ending of the original file.
    pub eol: LineEnding,
    /// Whether the file started with a UTF-8 byte order mark.
    pub bom: bool,
    /// Whether the text ended with a newline when it was read.
    pub trailing_newline: bool,
}

impl Default for DocumentMeta {
    fn default() -> Self {
        Self {
            eol: LineEnding::Lf,
            bom: false,
            trailing_newline: true,
        }
    }
}

/// A document read from disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    /// The path as given by the caller.
    pub path: String,
    /// Content with LF line endings; the trailing newline is kept.
    pub text: String,
    /// Storage details needed to write the file back.
    pub meta: DocumentMeta,
    /// Modification time in milliseconds since the Unix epoch.
    pub mtime_ms: u64,
}

/// Decodes file bytes into LF-only text and the metadata needed to restore
/// the original bytes.
///
/// A UTF-8 BOM is stripped and recorded. UTF-16 and invalid UTF-8 are errors:
/// the file is never silently re-encoded. The dominant line ending wins (ties
/// and files without newlines are `Lf`); a lone `\r` is normalized to `\n`.
pub fn decode(bytes: &[u8]) -> Result<(String, DocumentMeta), AppError> {
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        return Err(AppError::Encoding(
            "UTF-16 files are not supported; convert to UTF-8".to_string(),
        ));
    }
    let (bom, body) = match bytes.strip_prefix(&UTF8_BOM) {
        Some(rest) => (true, rest),
        None => (false, bytes),
    };
    let raw = std::str::from_utf8(body)
        .map_err(|e| AppError::Encoding(format!("The file is not valid UTF-8 ({e})")))?;

    let mut crlf = 0usize;
    let mut lf = 0usize;
    let mut prev_cr = false;
    for b in raw.bytes() {
        if b == b'\n' {
            if prev_cr {
                crlf += 1;
            } else {
                lf += 1;
            }
        }
        prev_cr = b == b'\r';
    }
    let eol = if crlf > lf {
        LineEnding::CrLf
    } else {
        LineEnding::Lf
    };

    let text = raw.replace("\r\n", "\n").replace('\r', "\n");
    let trailing_newline = text.ends_with('\n');
    Ok((
        text,
        DocumentMeta {
            eol,
            bom,
            trailing_newline,
        },
    ))
}

/// Encodes LF-only text back to bytes using `meta` (BOM and line ending).
///
/// This does not add or remove a trailing newline: `meta.trailing_newline` is
/// informational. The buffer holds the real final newline, so a user who
/// deletes it changed the file deliberately.
pub fn encode(text: &str, meta: &DocumentMeta) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len() + 3);
    if meta.bom {
        out.extend_from_slice(&UTF8_BOM);
    }
    match meta.eol {
        LineEnding::Lf => out.extend_from_slice(text.as_bytes()),
        LineEnding::CrLf => out.extend_from_slice(text.replace('\n', "\r\n").as_bytes()),
    }
    out
}

/// Reads and decodes the file at `path`.
pub fn read(path: &Path) -> Result<Document, AppError> {
    let bytes = fs::read(path)?;
    let (text, meta) = decode(&bytes)?;
    Ok(Document {
        path: path.to_string_lossy().into_owned(),
        text,
        meta,
        mtime_ms: mtime_ms(path)?,
    })
}

/// Encodes and writes `text` to `path`, returning the new modification time.
pub fn write(path: &Path, text: &str, meta: &DocumentMeta) -> Result<u64, AppError> {
    fs::write(path, encode(text, meta))?;
    mtime_ms(path)
}

/// Modification time of `path` in milliseconds since the Unix epoch (0 if the
/// clock reads before the epoch).
pub fn mtime_ms(path: &Path) -> Result<u64, AppError> {
    let modified = fs::metadata(path)?.modified()?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(bytes: &[u8]) {
        let (text, meta) = decode(bytes).unwrap();
        assert_eq!(encode(&text, &meta), bytes);
    }

    #[test]
    fn utf8_without_bom() {
        let (text, meta) = decode(b"# Hi\nthere\n").unwrap();
        assert_eq!(text, "# Hi\nthere\n");
        assert_eq!(
            meta,
            DocumentMeta {
                eol: LineEnding::Lf,
                bom: false,
                trailing_newline: true
            }
        );
    }

    #[test]
    fn utf8_with_bom() {
        let (text, meta) = decode(b"\xEF\xBB\xBFabc\n").unwrap();
        assert_eq!(text, "abc\n");
        assert!(meta.bom);
    }

    #[test]
    fn crlf_is_detected_and_normalized() {
        let (text, meta) = decode(b"a\r\nb\r\n").unwrap();
        assert_eq!(text, "a\nb\n");
        assert_eq!(meta.eol, LineEnding::CrLf);
    }

    #[test]
    fn mixed_endings_dominant_wins() {
        let (text, meta) = decode(b"a\r\nb\r\nc\n").unwrap();
        assert_eq!(meta.eol, LineEnding::CrLf);
        assert_eq!(text, "a\nb\nc\n");
        let (_, meta) = decode(b"a\nb\nc\r\n").unwrap();
        assert_eq!(meta.eol, LineEnding::Lf);
    }

    #[test]
    fn tie_is_lf() {
        let (_, meta) = decode(b"a\r\nb\n").unwrap();
        assert_eq!(meta.eol, LineEnding::Lf);
    }

    #[test]
    fn missing_trailing_newline() {
        let (text, meta) = decode(b"a\nb").unwrap();
        assert_eq!(text, "a\nb");
        assert!(!meta.trailing_newline);
        roundtrip(b"a\nb");
    }

    #[test]
    fn empty_file() {
        let (text, meta) = decode(b"").unwrap();
        assert_eq!(text, "");
        assert_eq!(
            meta,
            DocumentMeta {
                eol: LineEnding::Lf,
                bom: false,
                trailing_newline: false
            }
        );
        roundtrip(b"");
    }

    #[test]
    fn invalid_utf8_is_an_error() {
        let err = decode(b"ab\xFF\xFEcd\x80").unwrap_err();
        assert!(matches!(err, AppError::Encoding(ref m) if m.contains("not valid UTF-8")));
    }

    #[test]
    fn utf16_boms_are_errors() {
        for bytes in [&b"\xFF\xFEa\0"[..], &b"\xFE\xFF\0a"[..]] {
            let err = decode(bytes).unwrap_err();
            assert!(matches!(err, AppError::Encoding(ref m) if m.contains("UTF-16")));
        }
    }

    #[test]
    fn lone_cr_becomes_lf() {
        let (text, meta) = decode(b"a\rb\r").unwrap();
        assert_eq!(text, "a\nb\n");
        assert_eq!(meta.eol, LineEnding::Lf);
    }

    #[test]
    fn roundtrips_are_byte_identical() {
        roundtrip(b"\xEF\xBB\xBFone\r\ntwo\r\n");
        roundtrip(b"one\ntwo\n");
        roundtrip(b"one\ntwo");
        roundtrip(b"one\r\ntwo");
    }

    #[test]
    fn encode_does_not_double_cr() {
        let meta = DocumentMeta {
            eol: LineEnding::CrLf,
            ..DocumentMeta::default()
        };
        assert_eq!(encode("a\nb\n", &meta), b"a\r\nb\r\n");
    }

    #[test]
    fn serde_names() {
        let json = serde_json::to_string(&DocumentMeta::default()).unwrap();
        assert_eq!(json, r#"{"eol":"lf","bom":false,"trailingNewline":true}"#);
        let json = serde_json::to_string(&LineEnding::CrLf).unwrap();
        assert_eq!(json, r#""crlf""#);
    }

    #[test]
    fn read_write_read_leaves_bytes_identical() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let original: &[u8] = b"\xEF\xBB\xBF# Title\r\n\r\nbody\r\nlast";
        fs::write(&path, original).unwrap();

        let doc = read(&path).unwrap();
        assert_eq!(doc.path, path.to_string_lossy());
        assert_eq!(doc.text, "# Title\n\nbody\nlast");
        let mtime = write(&path, &doc.text, &doc.meta).unwrap();
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(mtime, mtime_ms(&path).unwrap());

        let again = read(&path).unwrap();
        assert_eq!(again.text, doc.text);
        assert_eq!(again.meta, doc.meta);
    }

    #[test]
    fn read_missing_file_is_io_error() {
        let dir = tempfile::tempdir().unwrap();
        let err = read(&dir.path().join("nope.md")).unwrap_err();
        assert!(matches!(err, AppError::Io(_)));
    }
}
