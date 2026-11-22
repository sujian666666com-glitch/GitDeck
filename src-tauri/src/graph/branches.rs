use std::path::Path;

use super::refs::{git_error, require_commit, resolve_commit};
use super::types::{MergeOutcome, MergeResult};
use crate::error::{AppError, AppResult};
use crate::git::{git, GitOutput};

pub(super) fn checkout(repo: &Path, name: &str) -> AppResult<()> {
    validate_name(repo, name)?;
    let out = git(repo)
        .args(["switch", "--no-guess", "--", name])
        .output()?;
    check_operation("切换失败", &out)
}

pub(super) fn checkout_remote(
    repo: &Path,
    remote_branch: &str,
    local_name: Option<&str>,
) -> AppResult<()> {
    let short = remote_branch
        .strip_prefix("refs/remotes/")
        .unwrap_or(remote_branch);
    let (_, default_name) = short
        .split_once('/')
        .ok_or_else(|| AppError::invalid("无效的远程分支名称"))?;
    validate_name(repo, short)?;
    let name = local_name
        .filter(|name| !name.is_empty())
        .unwrap_or(default_name);
    validate_name(repo, name)?;
    let full = format!("refs/remotes/{short}");
    require_commit(repo, &full)?;
    let out = git(repo)
        .args(["switch", "-c", name, "--track", "--", &full])
        .output()?;
    check_operation("检出失败", &out)
}

pub(super) fn create(
    repo: &Path,
    name: &str,
    start_point: Option<&str>,
    checkout: bool,
) -> AppResult<()> {
    validate_name(repo, name)?;
    let start = start_point
        .filter(|point| !point.is_empty())
        .map(|point| require_commit(repo, point))
        .transpose()?;
    let mut command = if checkout {
        git(repo).args(["switch", "-c", name, "--"])
    } else {
        git(repo).args(["branch", "--", name])
    };
    if let Some(hash) = start {
        command = command.arg(hash);
    }
    check_operation("创建分支失败", &command.output()?)
}

pub(super) fn delete(repo: &Path, name: &str, force: bool) -> AppResult<()> {
    validate_name(repo, name)?;
    let flag = if force { "-D" } else { "-d" };
    let out = git(repo).args(["branch", flag, "--", name]).output()?;
    check_operation("删除分支失败", &out)
}

pub(super) fn merge(repo: &Path, name: &str, no_ff: bool) -> AppResult<MergeResult> {
    let target = require_commit(repo, name)?;
    let before = resolve_commit(repo, "HEAD")?;
    let flag = if no_ff { "--no-ff" } else { "--ff" };
    let out = git(repo)
        .args(["merge", flag, "--no-edit", "--", name])
        .output()?;
    if !out.success() {
        if out.code == Some(1)
            && !git(repo)
                .args(["ls-files", "-u", "-z"])
                .run_bytes()?
                .is_empty()
        {
            return Ok(MergeResult {
                outcome: MergeOutcome::Conflicts,
                message: "合并产生冲突，请在 Changes 中解决".into(),
            });
        }
        check_operation("合并失败", &out)?;
    }

    let after = resolve_commit(repo, "HEAD")?;
    let (outcome, message) = if before == after {
        (MergeOutcome::UpToDate, "当前分支已包含这些提交")
    } else if after.as_deref() == Some(target.as_str()) {
        (MergeOutcome::FastForward, "已快进合并")
    } else {
        (MergeOutcome::Merged, "合并完成")
    };
    Ok(MergeResult {
        outcome,
        message: message.into(),
    })
}

fn validate_name(repo: &Path, name: &str) -> AppResult<()> {
    if name.is_empty() || name.starts_with('-') || name.starts_with("@{") {
        return Err(AppError::invalid("无效的分支名称"));
    }
    let out = git(repo)
        .args(["check-ref-format", "--branch", name])
        .output()?;
    if out.success() {
        Ok(())
    } else {
        Err(git_error("无效的分支名称", &out))
    }
}

fn check_operation(action: &str, out: &GitOutput) -> AppResult<()> {
    if out.success() {
        return Ok(());
    }
    let reason = if out.stderr.contains("would be overwritten") {
        "有未提交的修改会被覆盖，请先提交或暂存"
    } else if out.stderr.contains("already exists") {
        "本地同名分支已存在"
    } else if out.stderr.contains("not fully merged") {
        "分支尚未合并"
    } else if out.stderr.contains("used by worktree")
        || out.stderr.contains("checked out at")
        || out.stderr.contains("Cannot delete branch")
    {
        "分支正在被当前或其他工作树使用"
    } else if out.stderr.contains("invalid reference") || out.stderr.contains("not found") {
        "找不到该分支"
    } else if out.stderr.contains("unmerged files") || out.stderr.contains("need to resolve") {
        "请先在 Changes 中解决冲突"
    } else if out.stderr.contains("not a branch") || out.stderr.contains("a branch is expected") {
        "指定的引用不是分支"
    } else if out.stderr.contains("Author identity unknown")
        || out.stderr.contains("Committer identity unknown")
    {
        "请先配置 Git 用户名和邮箱"
    } else {
        "Git 无法完成该操作"
    };
    Err(git_error(&format!("{action}：{reason}"), out))
}
