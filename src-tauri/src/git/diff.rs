//! 单文件差异的统一数据结构。Git Graph（提交 Diff）与 Changes（工作区 Diff）共用，
//! 前端由 `src/components/diff/DiffViewer.tsx` 渲染。

use serde::{Deserialize, Serialize};

/// patch 文本上限，超出部分截断（按整行）
pub const MAX_PATCH_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    /// 仓库内相对路径（新路径）
    pub path: String,
    /// 重命名 / 复制前的路径
    pub old_path: Option<String>,
    pub binary: bool,
    /// patch 超过 MAX_PATCH_BYTES 被截断
    pub truncated: bool,
    /// `git diff` 原样输出的统一 diff 文本（含文件头和 @@ hunk）；二进制文件为空
    pub patch: String,
}

impl FileDiff {
    /// 由 `git diff` / `git show` 的原始输出构建：识别二进制、超长截断。
    /// 调用方应使用 `--no-color --no-ext-diff`，避免用户配置影响输出。
    pub fn from_patch(path: impl Into<String>, old_path: Option<String>, raw: &[u8]) -> Self {
        let text = String::from_utf8_lossy(raw);
        let path = path.into();
        if is_binary_patch(&text) {
            return Self { path, old_path, binary: true, truncated: false, patch: String::new() };
        }
        let (patch, truncated) = truncate_at_line(&text, MAX_PATCH_BYTES);
        Self { path, old_path, binary: false, truncated, patch: patch.to_string() }
    }
}

fn is_binary_patch(text: &str) -> bool {
    text.lines().any(|line| {
        (line.starts_with("Binary files ") && line.ends_with(" differ")) || line == "GIT binary patch"
    })
}

fn truncate_at_line(text: &str, max: usize) -> (&str, bool) {
    if text.len() <= max {
        return (text, false);
    }
    let mut cut = max;
    while !text.is_char_boundary(cut) {
        cut -= 1;
    }
    let cut = text[..cut].rfind('\n').map_or(cut, |i| i + 1);
    (&text[..cut], true)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PATCH: &str = "diff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n";

    #[test]
    fn keeps_text_patch() {
        let diff = FileDiff::from_patch("a.txt", None, PATCH.as_bytes());
        assert!(!diff.binary && !diff.truncated);
        assert_eq!(diff.patch, PATCH);
    }

    #[test]
    fn detects_binary_patch() {
        let raw = b"diff --git a/logo.png b/logo.png\nindex 1..2 100644\nBinary files a/logo.png and b/logo.png differ\n";
        let diff = FileDiff::from_patch("logo.png", None, raw);
        assert!(diff.binary);
        assert!(diff.patch.is_empty());
    }

    #[test]
    fn content_line_mentioning_binary_is_not_binary() {
        let raw = "@@ -1 +1 @@\n-Binary files a and b differ\n+x\n";
        assert!(!FileDiff::from_patch("a", None, raw.as_bytes()).binary);
    }

    #[test]
    fn truncates_on_line_boundary() {
        let line = "+0123456789\n";
        let raw = line.repeat(MAX_PATCH_BYTES / line.len() + 10);
        let diff = FileDiff::from_patch("big.txt", None, raw.as_bytes());
        assert!(diff.truncated);
        assert!(diff.patch.len() <= MAX_PATCH_BYTES);
        assert!(diff.patch.ends_with('\n'));
    }

    #[test]
    fn serializes_camel_case() {
        let diff = FileDiff::from_patch("b.txt", Some("a.txt".into()), b"");
        let json = serde_json::to_value(&diff).unwrap();
        assert_eq!(json["oldPath"], "a.txt");
        assert_eq!(json["truncated"], false);
    }
}
