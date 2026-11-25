//! 项目配置的持久化：`<app_config_dir>/projects.json`。
//!
//! 文件结构（只保存用户添加的内容，扫描结果不入库）：
//!
//! ```json
//! {
//!   "version": 1,
//!   "projects": [
//!     { "id": "…uuid…", "name": "AgentFlow", "folders": [{ "id": "…uuid…", "path": "/abs/path" }] }
//!   ]
//! }
//! ```
//!
//! - 文件不存在视为空列表；
//! - JSON 损坏或版本不认识时返回 `AppError::Config`，绝不覆盖原文件；
//! - 写入先在目标同目录独占创建名称唯一的临时文件（`create_new`），落盘后 `rename` 覆盖目标，
//!   任何失败都清理自己创建的临时文件。跨进程互斥由应用的单实例机制保证。

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// 当前配置结构版本
pub const CONFIG_VERSION: u32 = 1;

/// 配置文件名（位于应用配置目录下）
pub const CONFIG_FILE_NAME: &str = "projects.json";

/// 磁盘上的项目配置
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredConfig {
    pub version: u32,
    pub projects: Vec<StoredProject>,
}

impl StoredConfig {
    pub fn empty() -> Self {
        Self { version: CONFIG_VERSION, projects: Vec::new() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredProject {
    pub id: String,
    pub name: String,
    pub folders: Vec<StoredFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredFolder {
    pub id: String,
    /// 绝对路径
    pub path: String,
}

/// 读取配置：文件不存在时返回空配置
pub fn load(path: &Path) -> AppResult<StoredConfig> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(StoredConfig::empty()),
        Err(err) => return Err(AppError::Config(format!("读取项目配置失败：{err}"))),
    };

    let config: StoredConfig = serde_json::from_slice(&bytes)
        .map_err(|err| AppError::Config(format!("项目配置内容损坏，无法解析：{err}")))?;
    if config.version != CONFIG_VERSION {
        return Err(AppError::Config(format!(
            "项目配置版本 {0} 不受支持（当前支持 {1}）",
            config.version, CONFIG_VERSION
        )));
    }
    Ok(config)
}

/// 原子写入配置：先写临时文件并落盘，再 rename 覆盖目标文件
pub fn save(path: &Path, config: &StoredConfig) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| AppError::Config(format!("创建配置目录失败：{err}")))?;
    }

    let bytes = serde_json::to_vec_pretty(config)?;
    let (mut file, temp) = create_temp_file(path)?;

    let written = file.write_all(&bytes).and_then(|()| file.sync_all());
    drop(file);
    if let Err(err) = written {
        let _ = fs::remove_file(&temp);
        return Err(AppError::Config(format!("写入项目配置失败：{err}")));
    }

    if let Err(err) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(AppError::Config(format!("保存项目配置失败：{err}")));
    }
    Ok(())
}

/// 在目标同目录独占创建名称唯一的临时文件（`projects.json.<pid>.<uuid>.tmp`）
fn create_temp_file(target: &Path) -> AppResult<(fs::File, PathBuf)> {
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let base = target.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();

    for _ in 0..8 {
        let name = format!("{base}.{}.{}.tmp", std::process::id(), uuid::Uuid::new_v4().simple());
        let candidate = dir.join(name);
        match fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(file) => return Ok((file, candidate)),
            Err(err) if err.kind() == ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(AppError::Config(format!("创建临时配置文件失败：{err}"))),
        }
    }
    Err(AppError::Config("创建临时配置文件失败：临时文件名重复".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> StoredConfig {
        StoredConfig {
            version: CONFIG_VERSION,
            projects: vec![StoredProject {
                id: "p1".into(),
                name: "AgentFlow".into(),
                folders: vec![StoredFolder { id: "f1".into(), path: "/tmp/backend".into() }],
            }],
        }
    }

    #[test]
    fn missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let config = load(&dir.path().join(CONFIG_FILE_NAME)).unwrap();
        assert_eq!(config, StoredConfig::empty());
        assert!(config.projects.is_empty());
    }

    fn temp_files(dir: &Path) -> Vec<String> {
        fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect()
    }

    #[test]
    fn saves_and_reads_back() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join(CONFIG_FILE_NAME);
        let config = sample();
        save(&path, &config).unwrap();
        assert_eq!(load(&path).unwrap(), config);

        // 写入后不残留临时文件
        assert!(temp_files(path.parent().unwrap()).is_empty());
    }

    #[test]
    fn temp_file_names_are_unique_and_next_to_target() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);

        let (first, first_path) = create_temp_file(&path).unwrap();
        let (second, second_path) = create_temp_file(&path).unwrap();
        assert_ne!(first_path, second_path, "临时文件名必须唯一");
        assert_eq!(first_path.parent(), path.parent(), "临时文件必须与目标同目录");

        let name = first_path.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with("projects.json."), "{name}");
        assert!(name.ends_with(".tmp"), "{name}");

        drop(first);
        drop(second);
        fs::remove_file(&first_path).unwrap();
        fs::remove_file(&second_path).unwrap();
    }

    #[test]
    fn failed_save_keeps_target_and_cleans_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);
        save(&path, &sample()).unwrap();
        let before = fs::read(&path).unwrap();

        // 目标位置被目录占用：rename 必然失败
        let blocked = dir.path().join("blocked.json");
        fs::create_dir(&blocked).unwrap();
        let err = save(&blocked, &sample()).unwrap_err();
        assert!(matches!(err, AppError::Config(_)));
        assert!(blocked.is_dir(), "失败时不能动目标路径");

        assert_eq!(fs::read(&path).unwrap(), before, "失败时旧配置必须完整");
        assert!(temp_files(dir.path()).is_empty(), "失败时必须清理自己的临时文件");
    }

    #[test]
    fn overwrite_replaces_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);
        save(&path, &sample()).unwrap();

        let mut next = sample();
        next.projects[0].name = "SWClaw".into();
        next.projects[0].folders.clear();
        save(&path, &next).unwrap();

        let loaded = load(&path).unwrap();
        assert_eq!(loaded.projects[0].name, "SWClaw");
        assert!(loaded.projects[0].folders.is_empty());
    }

    #[test]
    fn corrupt_json_reports_error_and_keeps_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);
        let broken = b"{ \"version\": 1, \"projects\": [ ".to_vec();
        fs::write(&path, &broken).unwrap();

        let err = load(&path).unwrap_err();
        assert!(matches!(err, AppError::Config(_)));
        assert!(err.to_string().contains("损坏"));
        assert_eq!(fs::read(&path).unwrap(), broken, "损坏的文件必须保持原样");
    }

    #[test]
    fn unsupported_version_reports_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);
        fs::write(&path, br#"{ "version": 99, "projects": [] }"#).unwrap();

        let err = load(&path).unwrap_err();
        assert!(matches!(err, AppError::Config(_)));
        assert!(err.to_string().contains("99"));
    }

    #[test]
    fn version_field_is_required_and_written() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);
        fs::write(&path, br#"{ "projects": [] }"#).unwrap();
        assert!(load(&path).is_err());

        save(&path, &StoredConfig::empty()).unwrap();
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("\"version\": 1"), "{raw}");
    }
}
