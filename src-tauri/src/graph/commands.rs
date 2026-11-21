//! Git Graph 命令（前端封装见 `src/features/graph/api.ts`）。
//! 命令名、参数名（前端为 camelCase）与返回类型是契约，改动需同步前端。

#![allow(unused_variables)] // 脚手架桩：实现后删除

use super::types::{CommitDetail, CommitPage, CommitQuery, MergeResult, RepoRefs};
use crate::error::{AppError, AppResult};
use crate::git::FileDiff;

/// 分页读取提交（拓扑序，新在前），附带每个提交上的引用标签
#[tauri::command]
pub async fn graph_commits(repo_path: String, query: CommitQuery) -> AppResult<CommitPage> {
    Err(AppError::NotImplemented("graph_commits"))
}

/// 当前 HEAD、本地分支（含上游与 ahead/behind）、远程分支、Tag
#[tauri::command]
pub async fn graph_refs(repo_path: String) -> AppResult<RepoRefs> {
    Err(AppError::NotImplemented("graph_refs"))
}

#[tauri::command]
pub async fn graph_commit_detail(repo_path: String, hash: String) -> AppResult<CommitDetail> {
    Err(AppError::NotImplemented("graph_commit_detail"))
}

/// 某个提交中单个文件的 Diff（合并提交对比第一个父提交，根提交对比空树）
#[tauri::command]
pub async fn graph_commit_file_diff(
    repo_path: String,
    hash: String,
    path: String,
    old_path: Option<String>,
) -> AppResult<FileDiff> {
    Err(AppError::NotImplemented("graph_commit_file_diff"))
}

/// 切换到本地分支
#[tauri::command]
pub async fn branch_checkout(repo_path: String, name: String) -> AppResult<()> {
    Err(AppError::NotImplemented("branch_checkout"))
}

/// 把远程分支检出为本地跟踪分支；`local_name` 为空时使用去掉远程前缀的名称
#[tauri::command]
pub async fn branch_checkout_remote(
    repo_path: String,
    remote_branch: String,
    local_name: Option<String>,
) -> AppResult<()> {
    Err(AppError::NotImplemented("branch_checkout_remote"))
}

/// 基于 `start_point`（提交哈希或引用，空则为 HEAD）创建分支，可选立即切换
#[tauri::command]
pub async fn branch_create(
    repo_path: String,
    name: String,
    start_point: Option<String>,
    checkout: bool,
) -> AppResult<()> {
    Err(AppError::NotImplemented("branch_create"))
}

/// 删除本地分支；未合并的分支需要 `force`
#[tauri::command]
pub async fn branch_delete(repo_path: String, name: String, force: bool) -> AppResult<()> {
    Err(AppError::NotImplemented("branch_delete"))
}

/// 把 `name` 合并到当前分支
#[tauri::command]
pub async fn branch_merge(repo_path: String, name: String, no_ff: bool) -> AppResult<MergeResult> {
    Err(AppError::NotImplemented("branch_merge"))
}
