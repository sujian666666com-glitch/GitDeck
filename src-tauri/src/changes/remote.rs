use std::path::Path;
use super::lock::with_repo_lock;
use crate::error::{AppError, AppResult};
use crate::git::{git, GitOutput, NETWORK_TIMEOUT};

fn apply_ssh_batch_mode(mut cmd: crate::git::runner::Git, repo_path: &Path) -> crate::git::runner::Git {
    if std::env::var_os("GIT_SSH_COMMAND").is_none() && std::env::var_os("GIT_SSH").is_none() {
        let has_config = git(repo_path)
            .args(["config", "--get", "core.sshCommand"])
            .output()
            .map(|o| o.success() && !o.stdout.is_empty())
            .unwrap_or(false);
        if !has_config {
            cmd = cmd.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
        }
    }
    cmd
}

pub fn map_network_error(out: &GitOutput, default_msg: &str) -> AppError {
    let stderr = &out.stderr;
    let lower = stderr.to_lowercase();
    let message = if lower.contains("conflict")
        || lower.contains("automatic merge failed")
        || lower.contains("fix conflicts")
        || lower.contains("could not apply")
    {
        "拉取完成但产生冲突，请在「更改」中解决冲突后提交".to_string()
    } else if lower.contains("[remote rejected]")
        || lower.contains("hook declined")
        || lower.contains("protected branch")
    {
        "推送被远程拒绝（分支受保护或被钩子拦截）".to_string()
    } else if lower.contains("src refspec") && lower.contains("does not match") {
        "当前分支还没有提交，无法推送".to_string()
    } else if lower.contains("host key verification failed") {
        "SSH 主机指纹未确认，请先在终端执行一次 ssh 连接该主机".to_string()
    } else if lower.contains("authentication failed")
        || lower.contains("permission denied (publickey")
        || lower.contains("could not read from remote repository")
        || lower.contains("terminal prompts disabled")
        || lower.contains("could not read username")
        || lower.contains("could not read password")
    {
        "远程仓库认证失败，请检查凭据或 SSH Key 配置".to_string()
    } else if lower.contains("could not resolve host")
        || lower.contains("failed to connect")
        || lower.contains("connection timed out")
        || lower.contains("network is unreachable")
        || lower.contains("operation timed out")
        || lower.contains("ssh: connect to host")
    {
        "网络连接失败，请检查网络连接或远程仓库地址".to_string()
    } else if lower.contains("[rejected]")
        || lower.contains("non-fast-forward")
        || lower.contains("fetch first")
        || lower.contains("updates were rejected because the remote contains work")
        || lower.contains("updates were rejected because the tip of your current branch is behind")
    {
        "推送被拒绝（远程分支包含本地尚未合并的提交），请先拉取（Pull）后再推送".to_string()
    } else {
        crate::git::runner::summarize_stderr(stderr).unwrap_or_else(|| default_msg.to_string())
    };

    AppError::Git {
        message,
        detail: stderr.clone(),
    }
}

pub fn fetch_remote(repo_path: &str) -> AppResult<()> {
    let repo = Path::new(repo_path);
    let remotes = git(repo).args(["remote"]).run()?;
    if remotes.trim().is_empty() {
        return Err(AppError::invalid("未配置远程仓库"));
    }

    let cmd = git(repo).args(["fetch", "--all", "--prune"]).timeout(NETWORK_TIMEOUT);
    let cmd = apply_ssh_batch_mode(cmd, repo);
    let out = cmd.output()?;
    if !out.success() {
        return Err(map_network_error(&out, "获取远程更新失败"));
    }
    Ok(())
}

pub fn pull_remote(repo_path: &str) -> AppResult<()> {
    with_repo_lock(repo_path, || {
        let repo = Path::new(repo_path);
        let upstream_res = git(repo)
            .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
            .output()?;
        if !upstream_res.success() || upstream_res.stdout_text().trim().is_empty() {
            return Err(AppError::invalid("当前分支未设置上游分支，无法拉取"));
        }

        let has_pull_rebase = git(repo)
            .args(["config", "--get", "pull.rebase"])
            .output()
            .map(|o| o.success() && !o.stdout.is_empty())
            .unwrap_or(false);

        let branch_out = git(repo)
            .args(["symbolic-ref", "-q", "--short", "HEAD"])
            .run()
            .unwrap_or_default();
        let branch_name = branch_out.trim();
        let has_branch_rebase = if !branch_name.is_empty() {
            git(repo)
                .args(["config", "--get", &format!("branch.{}.rebase", branch_name)])
                .output()
                .map(|o| o.success() && !o.stdout.is_empty())
                .unwrap_or(false)
        } else {
            false
        };

        let mut args = vec!["pull"];
        if !has_pull_rebase && !has_branch_rebase {
            args.push("--no-rebase");
        }
        args.push("--no-edit");

        let cmd = git(repo)
            .args(&args)
            .env("GIT_MERGE_AUTOEDIT", "no")
            .timeout(NETWORK_TIMEOUT);
        let cmd = apply_ssh_batch_mode(cmd, repo);
        let out = cmd.output()?;
        if !out.success() {
            return Err(map_network_error(&out, "拉取远程更新失败"));
        }
        Ok(())
    })
}

pub fn push_remote(repo_path: &str) -> AppResult<()> {
    let repo = Path::new(repo_path);
    let branch_res = git(repo).args(["symbolic-ref", "-q", "--short", "HEAD"]).output()?;
    if !branch_res.success() {
        return Err(AppError::invalid("当前处于分离 HEAD 状态，无法推送"));
    }

    let upstream_res = git(repo)
        .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
        .output()?;
    let has_upstream = upstream_res.success() && !upstream_res.stdout_text().trim().is_empty();

    let cmd = if has_upstream {
        git(repo).args(["push"]).timeout(NETWORK_TIMEOUT)
    } else {
        let remotes_out = git(repo).args(["remote"]).run()?;
        let remotes: Vec<&str> = remotes_out.lines().map(str::trim).filter(|s| !s.is_empty()).collect();
        if remotes.is_empty() {
            return Err(AppError::invalid("未配置远程仓库"));
        }
        let remote = if remotes.contains(&"origin") { "origin" } else { remotes[0] };
        git(repo).args(["push", "-u", remote, "HEAD"]).timeout(NETWORK_TIMEOUT)
    };

    let cmd = apply_ssh_batch_mode(cmd, repo);
    let out = cmd.output()?;
    if !out.success() {
        return Err(map_network_error(&out, "推送失败"));
    }
    Ok(())
}
