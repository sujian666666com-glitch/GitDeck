//! 项目管理命令（前端封装见 `src/features/projects/api.ts`）。
//! 命令名、参数名（前端为 camelCase）与返回类型是契约，改动需同步前端。

#![allow(unused_variables)] // 脚手架桩：实现后删除

use tauri::AppHandle;

use super::types::{FolderNode, ProjectNode};
use crate::error::{AppError, AppResult};

/// 读取配置并扫描每个文件夹中的仓库
#[tauri::command]
pub async fn projects_list(app: AppHandle) -> AppResult<Vec<ProjectNode>> {
    Err(AppError::NotImplemented("projects_list"))
}

#[tauri::command]
pub async fn projects_create(app: AppHandle, name: String) -> AppResult<ProjectNode> {
    Err(AppError::NotImplemented("projects_create"))
}

#[tauri::command]
pub async fn projects_rename(app: AppHandle, project_id: String, name: String) -> AppResult<ProjectNode> {
    Err(AppError::NotImplemented("projects_rename"))
}

#[tauri::command]
pub async fn projects_delete(app: AppHandle, project_id: String) -> AppResult<()> {
    Err(AppError::NotImplemented("projects_delete"))
}

/// 给项目添加文件夹并立即扫描，返回扫描后的文件夹节点
#[tauri::command]
pub async fn projects_add_folder(app: AppHandle, project_id: String, path: String) -> AppResult<FolderNode> {
    Err(AppError::NotImplemented("projects_add_folder"))
}

#[tauri::command]
pub async fn projects_remove_folder(app: AppHandle, project_id: String, folder_id: String) -> AppResult<()> {
    Err(AppError::NotImplemented("projects_remove_folder"))
}
