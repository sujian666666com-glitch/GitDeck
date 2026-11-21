//! 共享的 git 基础设施：CLI 调用封装与差异数据结构。
//! 各业务模块（projects / graph / changes）都通过 `runner::git` 执行 git，不要直接用 `Command::new("git")`。

pub mod diff;
pub mod runner;

#[cfg(test)]
pub mod testutil;

pub use diff::FileDiff;
pub use runner::{git, GitOutput, NETWORK_TIMEOUT};
