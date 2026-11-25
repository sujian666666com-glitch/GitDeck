//! Tauri 命令入口，参数与 src/features/graph/api.ts 对应。

use std::path::Path;

use super::types::{CommitDetail, CommitPage, CommitQuery, MergeResult, RepoRefs};
use super::{branches, history, refs};
use crate::error::{blocking, AppResult};
use crate::git::FileDiff;

#[tauri::command]
pub async fn graph_commits(repo_path: String, query: CommitQuery) -> AppResult<CommitPage> {
    blocking(move || history::commits(Path::new(&repo_path), query)).await
}

#[tauri::command]
pub async fn graph_refs(repo_path: String) -> AppResult<RepoRefs> {
    blocking(move || refs::repo_refs(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn graph_commit_detail(repo_path: String, hash: String) -> AppResult<CommitDetail> {
    blocking(move || history::commit_detail(Path::new(&repo_path), &hash)).await
}

#[tauri::command]
pub async fn graph_commit_file_diff(
    repo_path: String,
    hash: String,
    path: String,
    old_path: Option<String>,
) -> AppResult<FileDiff> {
    blocking(move || history::commit_file_diff(Path::new(&repo_path), &hash, path, old_path)).await
}

#[tauri::command]
pub async fn branch_checkout(repo_path: String, name: String) -> AppResult<()> {
    blocking(move || branches::checkout(Path::new(&repo_path), &name)).await
}

#[tauri::command]
pub async fn branch_checkout_remote(
    repo_path: String,
    remote_branch: String,
    local_name: Option<String>,
) -> AppResult<()> {
    blocking(move || {
        branches::checkout_remote(Path::new(&repo_path), &remote_branch, local_name.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn branch_create(
    repo_path: String,
    name: String,
    start_point: Option<String>,
    checkout: bool,
) -> AppResult<()> {
    blocking(move || {
        branches::create(
            Path::new(&repo_path),
            &name,
            start_point.as_deref(),
            checkout,
        )
    })
    .await
}

#[tauri::command]
pub async fn branch_delete(repo_path: String, name: String, force: bool) -> AppResult<()> {
    blocking(move || branches::delete(Path::new(&repo_path), &name, force)).await
}

#[tauri::command]
pub async fn branch_merge(repo_path: String, name: String, no_ff: bool) -> AppResult<MergeResult> {
    blocking(move || branches::merge(Path::new(&repo_path), &name, no_ff)).await
}
