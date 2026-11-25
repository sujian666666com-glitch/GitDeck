//! 统一错误类型。命令返回 `AppResult<T>`，前端收到 `{ kind, message, detail }`。

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// git 命令执行失败：message 是给用户看的摘要，detail 是完整 stderr
    #[error("{message}")]
    Git { message: String, detail: String },
    #[error("{0}")]
    Io(#[from] std::io::Error),
    /// 参数不合法（空名称、路径不存在等）
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    NotFound(String),
    /// 本地配置读写或解析失败
    #[error("{0}")]
    Config(String),
    #[error("{0}")]
    Internal(String),
    /// 脚手架阶段的命令桩；模块实现完成后不应再出现
    #[allow(dead_code)]
    #[error("功能尚未实现：{0}")]
    NotImplemented(&'static str),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn invalid(msg: impl Into<String>) -> Self {
        Self::Invalid(msg.into())
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Self::Git { .. } => "git",
            Self::Io(_) => "io",
            Self::Invalid(_) => "invalid",
            Self::NotFound(_) => "notFound",
            Self::Config(_) => "config",
            Self::Internal(_) => "internal",
            Self::NotImplemented(_) => "notImplemented",
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::Config(format!("配置解析失败：{err}"))
    }
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    kind: &'a str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<&'a str>,
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let detail = match self {
            Self::Git { detail, .. } if !detail.is_empty() => Some(detail.as_str()),
            _ => None,
        };
        ErrorPayload { kind: self.kind(), message: self.to_string(), detail }.serialize(serializer)
    }
}

/// 在后台线程执行阻塞操作（git 子进程、文件扫描），避免卡住异步运行时。
pub async fn blocking<T, F>(f: F) -> AppResult<T>
where
    F: FnOnce() -> AppResult<T> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|err| AppError::Internal(format!("后台任务异常：{err}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_git_error_with_detail() {
        let err = AppError::Git { message: "无法切换分支".into(), detail: "error: pathspec".into() };
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["kind"], "git");
        assert_eq!(json["message"], "无法切换分支");
        assert_eq!(json["detail"], "error: pathspec");
    }

    #[test]
    fn omits_empty_detail() {
        let json = serde_json::to_value(AppError::invalid("名称不能为空")).unwrap();
        assert_eq!(json["kind"], "invalid");
        assert!(json.get("detail").is_none());
    }
}
