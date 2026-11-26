//! Changes 的前后端契约。修改时同步更新 `src/features/changes/types.ts`。

use serde::{Deserialize, Serialize};

/// 文件变更类型；界面徽标：M 修改、A 新增、D 删除、R 重命名、C 复制、T 类型变化、U 未跟踪、! 冲突
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ChangeKind {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StatusFile {
    /// 仓库内相对路径
    pub path: String,
    /// 重命名 / 复制前的路径
    pub old_path: Option<String>,
    pub kind: ChangeKind,
}

/// 仓库正在进行中的操作
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RepoOperation {
    Merge,
    Rebase,
    CherryPick,
    Revert,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    /// 当前分支；分离 HEAD 时为 None
    pub branch: Option<String>,
    /// 空仓库（尚无提交）为 None
    pub head_hash: Option<String>,
    /// 上游分支短名，如 `origin/main`
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// 是否配置了任何远程仓库
    pub has_remote: bool,
    /// 无法按 UTF-8 解码的文件名计数
    pub unreadable_paths: u32,
    /// 暂存区中的变更
    pub staged: Vec<StatusFile>,
    /// 工作区中未暂存的变更（含未跟踪文件）；部分暂存的文件会同时出现在 staged 与 unstaged
    pub unstaged: Vec<StatusFile>,
    /// 冲突文件（不再出现在 staged / unstaged 中）
    pub conflicted: Vec<StatusFile>,
    pub operation: Option<RepoOperation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    /// 新提交完整哈希
    pub hash: String,
    /// 提交标题行
    pub summary: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitAiConfig {
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}
