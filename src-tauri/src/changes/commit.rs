use std::path::Path;
use super::status::get_repo_status;
use super::types::CommitResult;
use crate::error::{AppError, AppResult};
use crate::git::git;

pub fn create_commit(repo_path: &str, message: &str, amend: bool) -> AppResult<CommitResult> {
    let repo = Path::new(repo_path);
    let trimmed = message.trim();
    if !amend && trimmed.is_empty() {
        return Err(AppError::invalid("提交信息不能为空"));
    }

    let status = get_repo_status(repo_path)?;
    if amend {
        if status.head_hash.is_none() {
            return Err(AppError::invalid("当前仓库尚无提交，无法修改提交"));
        }
    } else if status.staged.is_empty() {
        if status.unstaged.is_empty() {
            return Err(AppError::invalid("没有可提交的更改"));
        }
        // 暂存区为空且非 amend：自动暂存全部更改后提交
        git(repo).args(["add", "-A"]).run()?;
        let status2 = get_repo_status(repo_path)?;
        if status2.staged.is_empty() {
            return Err(AppError::invalid("没有可提交的更改"));
        }
    }

    let mut cmd = git(repo);
    if amend && trimmed.is_empty() {
        cmd = cmd.args(["commit", "--amend", "--no-edit"]);
    } else {
        let mut args = vec!["commit"];
        if amend {
            args.push("--amend");
        }
        args.extend(["-F", "-"]);
        cmd = cmd.args(&args).stdin(trimmed.as_bytes().to_vec());
    }

    let out = cmd.output()?;
    if !out.success() {
        let stderr = &out.stderr;
        if stderr.contains("Please tell me who you are")
            || stderr.contains("Author identity unknown")
            || stderr.contains("empty ident")
            || stderr.contains("no name was given")
        {
            return Err(AppError::Git {
                message: "未配置 Git 用户名或邮箱，请在终端运行 git config --global user.name \"你的名字\" 和 git config --global user.email \"你的邮箱\"".into(),
                detail: stderr.clone(),
            });
        }
        if stderr.contains("nothing to commit") || stderr.contains("no changes added to commit") {
            return Err(AppError::invalid("没有可提交的更改"));
        }
        return Err(AppError::Git {
            message: crate::git::runner::summarize_stderr(stderr).unwrap_or_else(|| "提交失败".to_string()),
            detail: stderr.clone(),
        });
    }

    let log_out = git(repo).args(["log", "-1", "--format=%H%x00%s"]).run()?;
    let parts: Vec<&str> = log_out.trim_end().split('\0').collect();
    if parts.len() < 2 {
        return Err(AppError::Internal("获取新提交信息失败".into()));
    }

    Ok(CommitResult {
        hash: parts[0].to_string(),
        summary: parts[1].to_string(),
    })
}
