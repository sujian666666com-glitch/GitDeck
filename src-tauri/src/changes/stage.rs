use std::collections::HashSet;
use std::path::Path;
use super::lock::with_repo_lock;
use crate::error::AppResult;
use crate::git::git;

pub fn stage_paths(repo_path: &str, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    with_repo_lock(repo_path, || {
        let repo = Path::new(repo_path);
        for chunk in paths.chunks(100) {
            let mut cmd = git(repo).args(["add", "-A", "--"]);
            for p in chunk {
                cmd = cmd.arg(p);
            }
            cmd.run()?;
        }
        Ok(())
    })
}

pub fn unstage_paths(repo_path: &str, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    with_repo_lock(repo_path, || {
        let repo = Path::new(repo_path);
        let has_head = git(repo)
            .args(["rev-parse", "--verify", "HEAD"])
            .output()
            .map(|o| o.success())
            .unwrap_or(false);

        for chunk in paths.chunks(100) {
            if has_head {
                let mut cmd = git(repo).args(["restore", "--staged", "--"]);
                for p in chunk {
                    cmd = cmd.arg(p);
                }
                cmd.run()?;
            } else {
                let mut cmd = git(repo).args(["rm", "--cached", "-r", "-q", "--"]);
                for p in chunk {
                    cmd = cmd.arg(p);
                }
                cmd.run()?;
            }
        }
        Ok(())
    })
}

pub fn discard_paths(repo_path: &str, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    with_repo_lock(repo_path, || {
        let repo = Path::new(repo_path);

        for chunk in paths.chunks(100) {
            let mut check_cmd = git(repo).args(["ls-files", "-z", "--others", "--exclude-standard", "--"]);
            for p in chunk {
                check_cmd = check_cmd.arg(p);
            }
            let untracked_raw = check_cmd.run_bytes().unwrap_or_default();
            let untracked_set: HashSet<String> = untracked_raw
                .split(|&b| b == 0)
                .filter(|s| !s.is_empty())
                .map(|s| String::from_utf8_lossy(s).into_owned())
                .collect();

            let mut tracked = Vec::new();
            let mut untracked = Vec::new();
            for p in chunk {
                if untracked_set.contains(p) {
                    untracked.push(p);
                } else {
                    tracked.push(p);
                }
            }

            if !tracked.is_empty() {
                let mut cmd = git(repo).args(["restore", "--worktree", "--"]);
                for p in tracked {
                    cmd = cmd.arg(p);
                }
                cmd.run()?;
            }

            if !untracked.is_empty() {
                let mut cmd = git(repo).args(["clean", "-f", "-d", "-q", "--"]);
                for p in untracked {
                    cmd = cmd.arg(p);
                }
                cmd.run()?;
            }
        }
        Ok(())
    })
}
