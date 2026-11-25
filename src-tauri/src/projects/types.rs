//! 项目管理的前后端契约。修改时同步更新 `src/features/projects/types.ts`。

use serde::{Deserialize, Serialize};

/// 侧边栏中的一个项目（用户自建的分组）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectNode {
    pub id: String,
    pub name: String,
    pub folders: Vec<FolderNode>,
}

/// 项目里添加的一个本地文件夹
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub id: String,
    /// 绝对路径
    pub path: String,
    /// 目录名，用于显示
    pub name: String,
    /// 目录当前是否存在（被删除或移动后为 false，仍保留在配置中）
    pub exists: bool,
    /// 文件夹本身就是一个 Git 仓库
    pub is_repo: bool,
    /// 识别到的仓库；`is_repo` 为 true 时只包含它自己
    pub repos: Vec<RepoNode>,
    /// 扫描因访问预算用尽提前结束，`repos` 只是部分结果
    pub truncated: bool,
}

/// 识别到的 Git 仓库
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoNode {
    /// 仓库根目录绝对路径，也是仓库在全应用中的唯一标识
    pub path: String,
    /// 显示名：相对所属文件夹的路径（如 `casdoor`、`services/auth`）；文件夹本身是仓库时为目录名
    pub name: String,
}
