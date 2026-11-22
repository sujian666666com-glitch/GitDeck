//! Git Graph 模块：提交历史、引用（分支 / Tag）、提交详情与分支操作。
//! 前端对应 `src/features/graph/`。

pub mod commands;
pub mod types;

mod branches;
mod history;
mod refs;

#[cfg(test)]
mod tests;
