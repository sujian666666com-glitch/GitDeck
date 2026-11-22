//! Changes 模块：工作区状态、Diff、暂存 / 取消暂存 / 丢弃、提交，以及 Fetch / Pull / Push。
//! 前端对应 `src/features/changes/`。

pub mod commands;
pub mod commit;
pub mod diff;
pub mod remote;
pub mod stage;
pub mod status;
pub mod types;

#[cfg(test)]
mod tests;
