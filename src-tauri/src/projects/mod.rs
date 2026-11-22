//! 项目管理模块：项目 / 文件夹 / 仓库三级结构、仓库自动识别、本地 JSON 持久化。
//! 前端对应 `src/features/projects/`。
//!
//! 模块结构：
//! - `types`    前后端契约
//! - `config`   `projects.json` 的读写（唯一临时文件 + rename、损坏时报错且不覆盖）
//! - `scan`     文件夹内 Git 仓库识别（访问预算、符号链接 / Windows 属性规则）
//! - `paths`    Windows 扩展路径的展示 / 存储形式
//! - `service`  校验与增删改核心逻辑（不依赖 `AppHandle`，扫描在锁外执行）
//! - `commands` Tauri 命令（薄封装）
//!
//! 不需要 managed state：读改写由模块内的 `static Mutex` 串行化，Builder 无需额外注册。

pub mod commands;
pub mod config;
pub mod paths;
pub mod scan;
pub mod service;
pub mod types;
