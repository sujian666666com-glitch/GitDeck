use std::path::Path;
use super::lock::with_repo_lock;
use super::status::detect_operation;
use super::types::RepoOperation;
use crate::error::{AppError, AppResult};
use crate::git::git;

pub fn operation_continue(repo_path: &str) -> AppResult<()> {
    with_repo_lock(repo_path, || {
        let repo = Path::new(repo_path);
        let op = detect_operation(repo);
        match op {
            Some(RepoOperation::Merge) => {
                let out = git(repo)
                    .args(["merge", "--continue"])
                    .env("GIT_EDITOR", "true")
                    .output()?;
                if !out.success() {
                    return Err(AppError::Git {
                        message: crate::git::runner::summarize_stderr(&out.stderr)
                            .unwrap_or_else(|| "合并继续失败".to_string()),
                        detail: out.stderr,
                    });
                }
                Ok(())
            }
            Some(RepoOperation::Rebase) => {
                let out = git(repo)
                    .args(["rebase", "--continue"])
                    .env("GIT_EDITOR", "true")
                    .output()?;
                if !out.success() {
                    return Err(AppError::Git {
                        message: crate::git::runner::summarize_stderr(&out.stderr)
                            .unwrap_or_else(|| "变基继续失败".to_string()),
                        detail: out.stderr,
                    });
                }
                Ok(())
            }
            Some(RepoOperation::CherryPick) => {
                let out = git(repo)
                    .args(["cherry-pick", "--continue"])
                    .env("GIT_EDITOR", "true")
                    .output()?;
                if !out.success() {
                    return Err(AppError::Git {
                        message: crate::git::runner::summarize_stderr(&out.stderr)
                            .unwrap_or_else(|| "拣选继续失败".to_string()),
                        detail: out.stderr,
                    });
                }
                Ok(())
            }
            Some(RepoOperation::Revert) => {
                let out = git(repo)
                    .args(["revert", "--continue"])
                    .env("GIT_EDITOR", "true")
                    .output()?;
                if !out.success() {
                    return Err(AppError::Git {
                        message: crate::git::runner::summarize_stderr(&out.stderr)
                            .unwrap_or_else(|| "还原继续失败".to_string()),
                        detail: out.stderr,
                    });
                }
                Ok(())
            }
            None => Err(AppError::invalid("当前没有进行中的操作")),
        }
    })
}

pub fn operation_abort(repo_path: &str) -> AppResult<()> {
    with_repo_lock(repo_path, || {
        let repo = Path::new(repo_path);
        let op = detect_operation(repo);
        match op {
            Some(RepoOperation::Merge) => {
                let out = git(repo).args(["merge", "--abort"]).output()?;
                if !out.success() {
                    return Err(AppError::Git {
                        message: crate::git::runner::summarize_stderr(&out.stderr)
                            .unwrap_or_else(|| "中止合并失败".to_string()),
                        detail: out.stderr,
                    });
                }
                Ok(())
            }
            Some(RepoOperation::Rebase) => {
                let out = git(repo).args(["rebase", "--abort"]).output()?;
                if !out.success() {
                    return Err(AppError::Git {
                        message: crate::git::runner::summarize_stderr(&out.stderr)
                            .unwrap_or_else(|| "中止变基失败".to_string()),
                        detail: out.stderr,
                    });
                }
                Ok(())
            }
            Some(RepoOperation::CherryPick) => {
                let out = git(repo).args(["cherry-pick", "--abort"]).output()?;
                if !out.success() {
                    return Err(AppError::Git {
                        message: crate::git::runner::summarize_stderr(&out.stderr)
                            .unwrap_or_else(|| "中止拣选失败".to_string()),
                        detail: out.stderr,
                    });
                }
                Ok(())
            }
            Some(RepoOperation::Revert) => {
                let out = git(repo).args(["revert", "--abort"]).output()?;
                if !out.success() {
                    return Err(AppError::Git {
                        message: crate::git::runner::summarize_stderr(&out.stderr)
                            .unwrap_or_else(|| "中止还原失败".to_string()),
                        detail: out.stderr,
                    });
                }
                Ok(())
            }
            None => Err(AppError::invalid("当前没有进行中的操作")),
        }
    })
}
