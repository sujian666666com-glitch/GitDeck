//! GitDeck 后端入口：注册插件与全部命令。
//!
//! 模块分工：
//! - `git`      共享：git CLI 调用封装、FileDiff
//! - `projects` 项目管理
//! - `graph`    Git Graph
//! - `changes`  Changes 与远程同步
//!
//! 新增命令时只在自己模块那一段的末尾追加，各段之间保留空行，便于并行开发时合并。

pub mod changes;
pub mod error;
pub mod git;
pub mod graph;
pub mod projects;

pub fn run() {
    tauri::Builder::default()
        // 单实例：再次启动时聚焦已有窗口，避免两个进程同时读写同一份项目配置
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // ── 项目管理（projects）──
            projects::commands::projects_list,
            projects::commands::projects_create,
            projects::commands::projects_rename,
            projects::commands::projects_delete,
            projects::commands::projects_add_folder,
            projects::commands::projects_remove_folder,

            // ── Git Graph（graph）──
            graph::commands::graph_commits,
            graph::commands::graph_refs,
            graph::commands::graph_commit_detail,
            graph::commands::graph_commit_file_diff,
            graph::commands::branch_checkout,
            graph::commands::branch_checkout_remote,
            graph::commands::branch_create,
            graph::commands::branch_delete,
            graph::commands::branch_merge,

            // ── Changes 与远程同步（changes）──
            changes::commands::changes_status,
            changes::commands::changes_file_diff,
            changes::commands::changes_stage,
            changes::commands::changes_unstage,
            changes::commands::changes_discard,
            changes::commands::changes_commit,
            changes::commands::remote_fetch,
            changes::commands::remote_pull,
            changes::commands::remote_push,
            changes::commands::changes_operation_continue,
            changes::commands::changes_operation_abort,

            // ── 结束 ──
        ])
        .run(tauri::generate_context!())
        .expect("GitDeck 启动失败");
}
