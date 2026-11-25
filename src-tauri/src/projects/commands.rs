//! 项目管理命令（前端封装见 `src/features/projects/api.ts`）。
//! 命令名、参数名（前端为 camelCase）与返回类型是契约，改动需同步前端。
//!
//! 这里只做薄封装：定位配置文件路径、把阻塞的文件扫描 / 读写放进 `blocking`，
//! 具体逻辑见 `super::service`。

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use super::config::CONFIG_FILE_NAME;
use super::service;
use super::types::{FolderNode, ProjectNode};
use crate::error::{blocking, AppError, AppResult};

/// 解析 `<app_config_dir>/projects.json`
fn config_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| AppError::Config(format!("无法定位应用配置目录：{err}")))?;
    Ok(dir.join(CONFIG_FILE_NAME))
}

/// 读取配置并扫描每个文件夹中的仓库
#[tauri::command]
pub async fn projects_list(app: AppHandle) -> AppResult<Vec<ProjectNode>> {
    let path = config_path(&app)?;
    blocking(move || service::list(&path)).await
}

#[tauri::command]
pub async fn projects_create(app: AppHandle, name: String) -> AppResult<ProjectNode> {
    let path = config_path(&app)?;
    blocking(move || service::create(&path, &name)).await
}

#[tauri::command]
pub async fn projects_rename(app: AppHandle, project_id: String, name: String) -> AppResult<ProjectNode> {
    let path = config_path(&app)?;
    blocking(move || service::rename(&path, &project_id, &name)).await
}

#[tauri::command]
pub async fn projects_delete(app: AppHandle, project_id: String) -> AppResult<()> {
    let path = config_path(&app)?;
    blocking(move || service::delete(&path, &project_id)).await
}

/// 给项目添加文件夹并立即扫描，返回扫描后的文件夹节点
#[tauri::command]
pub async fn projects_add_folder(app: AppHandle, project_id: String, path: String) -> AppResult<FolderNode> {
    let config = config_path(&app)?;
    blocking(move || service::add_folder(&config, &project_id, &path)).await
}

#[tauri::command]
pub async fn projects_remove_folder(app: AppHandle, project_id: String, folder_id: String) -> AppResult<()> {
    let path = config_path(&app)?;
    blocking(move || service::remove_folder(&path, &project_id, &folder_id)).await
}
