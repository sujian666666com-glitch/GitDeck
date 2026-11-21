//! Changes 与远程同步命令（前端封装见 `src/features/changes/api.ts`）。
//! 命令名、参数名（前端为 camelCase）与返回类型是契约，改动需同步前端。

#![allow(unused_variables)] // 脚手架桩：实现后删除

use super::types::{CommitResult, RepoStatus};
use crate::error::{AppError, AppResult};
use crate::git::FileDiff;

#[tauri::command]
pub async fn changes_status(repo_path: String) -> AppResult<RepoStatus> {
    Err(AppError::NotImplemented("changes_status"))
}

/// 单个文件的 Diff：`staged` 为 true 时对比 HEAD 与暂存区，否则对比暂存区与工作区（未跟踪文件对比空文件）
#[tauri::command]
pub async fn changes_file_diff(repo_path: String, path: String, staged: bool) -> AppResult<FileDiff> {
    Err(AppError::NotImplemented("changes_file_diff"))
}

#[tauri::command]
pub async fn changes_stage(repo_path: String, paths: Vec<String>) -> AppResult<()> {
    Err(AppError::NotImplemented("changes_stage"))
}

#[tauri::command]
pub async fn changes_unstage(repo_path: String, paths: Vec<String>) -> AppResult<()> {
    Err(AppError::NotImplemented("changes_unstage"))
}

/// 丢弃工作区修改；未跟踪文件会被删除（调用前由前端确认）
#[tauri::command]
pub async fn changes_discard(repo_path: String, paths: Vec<String>) -> AppResult<()> {
    Err(AppError::NotImplemented("changes_discard"))
}

/// 提交。暂存区为空且不是 amend 时，先暂存全部更改再提交
#[tauri::command]
pub async fn changes_commit(repo_path: String, message: String, amend: bool) -> AppResult<CommitResult> {
    Err(AppError::NotImplemented("changes_commit"))
}

#[tauri::command]
pub async fn remote_fetch(repo_path: String) -> AppResult<()> {
    Err(AppError::NotImplemented("remote_fetch"))
}

#[tauri::command]
pub async fn remote_pull(repo_path: String) -> AppResult<()> {
    Err(AppError::NotImplemented("remote_pull"))
}

/// 推送当前分支；没有上游时自动设置上游
#[tauri::command]
pub async fn remote_push(repo_path: String) -> AppResult<()> {
    Err(AppError::NotImplemented("remote_push"))
}
