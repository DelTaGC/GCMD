//! The single error type returned by every backend command.

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// Error returned to the frontend as `{ "kind": "...", "message": "..." }`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A filesystem operation failed (serialized kind `io`).
    #[error("{0}")]
    Io(String),
    /// The file's bytes are not a supported text encoding (kind `encoding`).
    #[error("{0}")]
    Encoding(String),
    /// A path argument was missing or unusable (kind `invalidPath`).
    #[error("{0}")]
    InvalidPath(String),
    /// Settings could not be parsed or stored (kind `settings`).
    #[error("{0}")]
    Settings(String),
    /// Checking for, downloading or installing an update failed (kind `update`).
    #[error("{0}")]
    Update(String),
    /// An unexpected internal failure (kind `internal`).
    #[error("{0}")]
    Internal(String),
}

impl AppError {
    /// Stable machine-readable discriminator sent to the frontend.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Io(_) => "io",
            Self::Encoding(_) => "encoding",
            Self::InvalidPath(_) => "invalidPath",
            Self::Settings(_) => "settings",
            Self::Update(_) => "update",
            Self::Internal(_) => "internal",
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_kind_and_message() {
        let err = AppError::Io("disk on fire".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, r#"{"kind":"io","message":"disk on fire"}"#);
    }

    #[test]
    fn kinds_are_stable() {
        assert_eq!(AppError::Encoding(String::new()).kind(), "encoding");
        assert_eq!(AppError::InvalidPath(String::new()).kind(), "invalidPath");
        assert_eq!(AppError::Settings(String::new()).kind(), "settings");
        assert_eq!(AppError::Update(String::new()).kind(), "update");
        assert_eq!(AppError::Internal(String::new()).kind(), "internal");
    }

    #[test]
    fn converts_from_io_error() {
        let err: AppError = std::io::Error::other("nope").into();
        assert!(matches!(err, AppError::Io(ref m) if m == "nope"));
    }
}
