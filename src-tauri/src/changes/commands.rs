//! Changes 与远程同步命令（前端封装见 `src/features/changes/api.ts`）。
//! 命令名、参数名（前端为 camelCase）与返回类型是契约，改动需同步前端。

use super::commit::create_commit;
use super::diff::get_file_diff;
use super::operation::{operation_abort, operation_continue};
use super::remote::{fetch_remote, pull_remote, push_remote};
use super::stage::{discard_paths, stage_paths, unstage_paths};
use super::status::get_repo_status;
use super::types::{CommitAiConfig, CommitResult, RepoStatus};
use crate::error::{blocking, AppResult};
use crate::git::FileDiff;

#[tauri::command]
pub async fn changes_status(repo_path: String) -> AppResult<RepoStatus> {
    blocking(move || get_repo_status(&repo_path)).await
}

/// 单个文件的 Diff：`staged` 为 true 时对比 HEAD 与暂存区，否则对比暂存区与工作区（未跟踪文件对比空文件）
#[tauri::command]
pub async fn changes_file_diff(repo_path: String, path: String, staged: bool) -> AppResult<FileDiff> {
    blocking(move || get_file_diff(&repo_path, &path, staged)).await
}

#[tauri::command]
pub async fn changes_stage(repo_path: String, paths: Vec<String>) -> AppResult<()> {
    blocking(move || stage_paths(&repo_path, &paths)).await
}

#[tauri::command]
pub async fn changes_unstage(repo_path: String, paths: Vec<String>) -> AppResult<()> {
    blocking(move || unstage_paths(&repo_path, &paths)).await
}

/// 丢弃工作区修改；未跟踪文件会被删除（调用前由前端确认）
#[tauri::command]
pub async fn changes_discard(repo_path: String, paths: Vec<String>) -> AppResult<()> {
    blocking(move || discard_paths(&repo_path, &paths)).await
}

/// 提交。暂存区为空且不是 amend 时，先暂存全部更改再提交
#[tauri::command]
pub async fn changes_commit(repo_path: String, message: String, amend: bool) -> AppResult<CommitResult> {
    blocking(move || create_commit(&repo_path, &message, amend)).await
}

#[tauri::command]
pub async fn changes_generate_message(repo_path: String, config: CommitAiConfig) -> AppResult<String> {
    blocking(move || super::message::generate(&repo_path, config)).await
}

#[tauri::command]
pub async fn remote_fetch(repo_path: String) -> AppResult<()> {
    blocking(move || fetch_remote(&repo_path)).await
}

#[tauri::command]
pub async fn remote_pull(repo_path: String) -> AppResult<()> {
    blocking(move || pull_remote(&repo_path)).await
}

/// 推送当前分支；没有上游时自动设置上游
#[tauri::command]
pub async fn remote_push(repo_path: String) -> AppResult<()> {
    blocking(move || push_remote(&repo_path)).await
}

/// 继续进行中的操作（merge / rebase / cherry-pick / revert）
#[tauri::command]
pub async fn changes_operation_continue(repo_path: String) -> AppResult<()> {
    blocking(move || operation_continue(&repo_path)).await
}

/// 中止进行中的操作（merge / rebase / cherry-pick / revert）
#[tauri::command]
pub async fn changes_operation_abort(repo_path: String) -> AppResult<()> {
    blocking(move || operation_abort(&repo_path)).await
}
