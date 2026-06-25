mod package;
mod session;
mod settings;

pub use package::{PackageEntry, ThreeMfPackage, read_three_mf_package, write_three_mf_package};
pub use session::{
    ChangeRecord, ChatCraftSession, ProjectObject, ProjectSummary, SettingComparison,
};
pub use settings::ProjectSettings;

#[derive(Debug, thiserror::Error)]
pub enum ChatCraftError {
    #[error("{message}")]
    InvalidPackage { code: &'static str, message: String },
    #[error("{message}")]
    InvalidSetting { code: &'static str, message: String },
    #[error("{message}")]
    Unsupported { code: &'static str, message: String },
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, ChatCraftError>;

impl ChatCraftError {
    pub fn code(&self) -> &'static str {
        match self {
            ChatCraftError::InvalidPackage { code, .. }
            | ChatCraftError::InvalidSetting { code, .. }
            | ChatCraftError::Unsupported { code, .. } => code,
            ChatCraftError::Io(_) => "io_error",
            ChatCraftError::Zip(_) => "zip_error",
            ChatCraftError::Json(_) => "json_error",
        }
    }

    pub(crate) fn invalid_package(code: &'static str, message: impl Into<String>) -> Self {
        Self::InvalidPackage {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn invalid_setting(code: &'static str, message: impl Into<String>) -> Self {
        Self::InvalidSetting {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn unsupported(code: &'static str, message: impl Into<String>) -> Self {
        Self::Unsupported {
            code,
            message: message.into(),
        }
    }
}
