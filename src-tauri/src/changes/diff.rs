use crate::error::{AppError, AppResult};
use crate::git::{git, runner::Git, FileDiff};
use std::path::Path;

#[cfg(windows)]
const NULL_DEVICE: &str = "NUL";
#[cfg(not(windows))]
const NULL_DEVICE: &str = "/dev/null";

pub fn get_file_diff(repo_path: &str, path: &str, staged: bool) -> AppResult<FileDiff> {
    let repo = Path::new(repo_path);
    let untracked = !staged
        && !git(repo)
            .args([
                "--literal-pathspecs",
                "ls-files",
                "--error-unmatch",
                "--",
                path,
            ])
            .output()?
            .success();
    let cmd = git(repo).args(["--literal-pathspecs", "diff"]);
    let raw = read_patch(cmd, path, None, staged, untracked)?;
    let old_path = raw.split(|&b| b == b'\n').find_map(|line| {
        let name = line.strip_prefix(b"rename from ")?;
        String::from_utf8(name.strip_suffix(b"\r").unwrap_or(name).to_vec()).ok()
    });
    Ok(FileDiff::from_patch(path, old_path, &raw))
}

pub(super) fn read_patch(
    cmd: Git,
    path: &str,
    old_path: Option<&str>,
    staged: bool,
    untracked: bool,
) -> AppResult<Vec<u8>> {
    let cmd = cmd.args(["--no-color", "--no-ext-diff"]);
    if untracked {
        let out = cmd.args(["--no-index", "--", NULL_DEVICE, path]).output()?;
        if matches!(out.code, Some(0 | 1)) {
            return Ok(out.stdout);
        }
        return Err(AppError::Git {
            message: format!("获取文件差异失败：{path}"),
            detail: out.stderr,
        });
    }

    // 不指定基准时，--cached 在首次提交前会自动与空树比较。
    let cmd = if staged { cmd.arg("--cached") } else { cmd };
    cmd.arg("--").args(old_path).arg(path).run_bytes()
}
