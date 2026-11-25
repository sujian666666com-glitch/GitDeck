//! Git Graph 的前后端契约。修改时同步更新 `src/features/graph/types.ts`。

use serde::{Deserialize, Serialize};

/// 引用类型：颜色只区分分支，类型靠图标区分（本地分支 / 远程云朵 / Tag）
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RefKind {
    /// 分离状态的 HEAD
    Head,
    Local,
    Remote,
    Tag,
}

/// 提交行右侧展示的引用标签
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    /// 短名：`main`、`origin/main`、`v1.0.0`
    pub name: String,
    /// 完整引用名：`refs/heads/main`
    pub full_name: String,
    pub kind: RefKind,
    /// 当前检出的分支（或分离 HEAD）
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub hash: String,
    pub short_hash: String,
    /// 父提交完整哈希，第一个为主父提交
    pub parents: Vec<String>,
    pub subject: String,
    pub author_name: String,
    pub author_email: String,
    /// Unix 秒
    pub author_time: i64,
    pub refs: Vec<RefLabel>,
}

/// 图谱筛选：`{ "kind": "all" }`、`{ "kind": "ref", "ref": "main" }`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BranchFilter {
    /// 全部分支（本地 + 远程 + Tag + HEAD）
    All,
    Local,
    Remote,
    Tags,
    /// 只看某个引用可达的提交
    Ref {
        #[serde(rename = "ref")]
        reference: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitQuery {
    pub filter: BranchFilter,
    pub skip: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitPage {
    /// 按图谱顺序（拓扑序、新在前）
    pub commits: Vec<CommitSummary>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HeadInfo {
    /// 当前分支短名；分离 HEAD 时为 None
    pub branch: Option<String>,
    /// HEAD 指向的提交；空仓库为 None
    pub hash: Option<String>,
    pub detached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranch {
    pub name: String,
    pub hash: String,
    pub is_current: bool,
    /// 上游跟踪分支短名，如 `origin/main`
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranch {
    /// `origin/main`
    pub name: String,
    /// `origin`
    pub remote: String,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagRef {
    pub name: String,
    /// Tag 最终指向的提交（附注 Tag 已解引用）
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoRefs {
    pub head: HeadInfo,
    pub locals: Vec<LocalBranch>,
    pub remotes: Vec<RemoteBranch>,
    pub tags: Vec<TagRef>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FileChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Unmerged,
    Unknown,
}

/// 提交中变更的文件
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub kind: FileChangeKind,
    /// 二进制文件为 None
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    #[serde(flatten)]
    pub summary: CommitSummary,
    /// 提交信息正文（不含标题行）
    pub body: String,
    pub committer_name: String,
    pub committer_email: String,
    pub commit_time: i64,
    /// 合并提交相对第一个父提交的变更
    pub files: Vec<CommitFile>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MergeOutcome {
    Merged,
    FastForward,
    UpToDate,
    /// 产生冲突，需要用户在 Changes 中解决
    Conflicts,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub outcome: MergeOutcome,
    /// 给用户看的结果说明
    pub message: String,
}
