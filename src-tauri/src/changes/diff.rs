use std::path::Path;
use crate::error::AppResult;
use crate::git::{git, FileDiff};

pub fn get_file_diff(repo_path: &str, path: &str, staged: bool) -> AppResult<FileDiff> {
    let repo = Path::new(repo_path);
    if staged {
        let has_head = git(repo)
            .args(["rev-parse", "--verify", "HEAD"])
            .output()
            .map(|o| o.success())
            .unwrap_or(false);

        let raw = if has_head {
            git(repo)
                .args(["diff", "--cached", "--no-color", "--no-ext-diff", "--", path])
                .run_bytes()?
        } else {
            // 空仓库初始提交前对比空树
            git(repo)
                .args([
                    "diff",
                    "--cached",
                    "--no-color",
                    "--no-ext-diff",
                    "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
                    "--",
                    path,
                ])
                .run_bytes()?
        };

        let old_path = raw.split(|&b| b == b'\n').find_map(|line| {
            if line.starts_with(b"rename from ") {
                String::from_utf8(line[12..].to_vec()).ok()
            } else {
                None
            }
        });

        Ok(FileDiff::from_patch(path, old_path, &raw))
    } else {
        let is_tracked = git(repo)
            .args(["ls-files", "--error-unmatch", "--", path])
            .output()
            .map(|o| o.success())
            .unwrap_or(false);

        if !is_tracked {
            let out = git(repo)
                .args(["diff", "--no-index", "--no-color", "--no-ext-diff", "--", "/dev/null", path])
                .output()?;
            if out.code == Some(0) || out.code == Some(1) {
                Ok(FileDiff::from_patch(path, None, &out.stdout))
            } else {
                Err(crate::error::AppError::Git {
                    message: format!("获取文件差异失败：{}", path),
                    detail: out.stderr,
                })
            }
        } else {
            let raw = git(repo)
                .args(["diff", "--no-color", "--no-ext-diff", "--", path])
                .run_bytes()?;
            Ok(FileDiff::from_patch(path, None, &raw))
        }
    }
}
