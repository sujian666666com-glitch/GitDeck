//! 仓库识别：递归扫描一个文件夹，找出其中的 Git 仓库。
//!
//! 规则（与产品约定一致）：
//! - 目录下存在 `.git`（目录或文件，兼容 worktree / submodule）即为仓库；
//! - 被添加的文件夹本身是仓库时，只返回它自己；
//! - 否则递归子目录，最大深度 4（相对被添加文件夹的路径层数），识别到仓库后不再深入；
//! - 跳过隐藏目录、常见依赖 / 构建目录，不跟随符号链接，无权限读取的目录直接跳过。

use std::fs;
use std::path::Path;

use super::types::RepoNode;

/// 递归扫描的最大深度：仓库相对被添加文件夹的路径最多 4 层
pub const MAX_DEPTH: usize = 4;

/// 跳过的大型依赖 / 构建目录（`.venv` 之类隐藏目录由「以 . 开头」规则跳过）
const SKIP_DIRS: [&str; 8] = ["node_modules", "target", "dist", "build", "vendor", "venv", "Pods", "__pycache__"];

/// 一次扫描的结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanOutcome {
    /// 被扫描的目录本身就是一个仓库
    pub is_repo: bool,
    /// 识别到的仓库（按名称不区分大小写排序）
    pub repos: Vec<RepoNode>,
}

/// 扫描目录。返回 `None` 表示目录不存在或不是目录。
pub fn scan_folder(path: &Path) -> Option<ScanOutcome> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_dir() {
        return None;
    }

    if is_repo(path) {
        let name = dir_name(path);
        return Some(ScanOutcome {
            is_repo: true,
            repos: vec![RepoNode { path: path_to_string(path), name }],
        });
    }

    let mut repos = Vec::new();
    collect(path, path, 0, &mut repos);
    repos.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
    Some(ScanOutcome { is_repo: false, repos })
}

/// 目录下是否有 `.git`（目录或文件）；不跟随符号链接
fn is_repo(dir: &Path) -> bool {
    fs::symlink_metadata(dir.join(".git")).is_ok()
}

fn collect(root: &Path, dir: &Path, depth: usize, out: &mut Vec<RepoNode>) {
    if depth >= MAX_DEPTH {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        // 无权限、目录被删除等情况直接跳过
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        // 符号链接的 file_type 是 symlink 而不是 dir，因此不会被跟随
        if !file_type.is_dir() {
            continue;
        }
        let file_name = entry.file_name();
        if should_skip(&file_name) {
            continue;
        }

        let child = entry.path();
        if is_repo(&child) {
            out.push(RepoNode {
                name: relative_name(root, &child),
                path: path_to_string(&child),
            });
        } else {
            collect(root, &child, depth + 1, out);
        }
    }
}

fn should_skip(name: &std::ffi::OsStr) -> bool {
    let name = name.to_string_lossy();
    if name.starts_with('.') {
        return true;
    }
    SKIP_DIRS.iter().any(|skip| name.eq_ignore_ascii_case(skip))
}

/// 相对所属文件夹的路径，统一用 `/` 分隔
fn relative_name(root: &Path, child: &Path) -> String {
    match child.strip_prefix(root) {
        Ok(rel) => rel
            .components()
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/"),
        Err(_) => dir_name(child),
    }
}

fn dir_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path_to_string(path))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// 测试辅助：在指定目录 `git init`
#[cfg(test)]
pub fn init_repo(dir: &Path) {
    fs::create_dir_all(dir).expect("create repo dir");
    let out = std::process::Command::new("git")
        .args(["init", "-q", "-b", "main"])
        .current_dir(dir)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .expect("spawn git");
    assert!(out.status.success(), "git init failed: {}", String::from_utf8_lossy(&out.stderr));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("create temp dir")
    }

    fn repo_paths(outcome: &ScanOutcome) -> Vec<&str> {
        outcome.repos.iter().map(|repo| repo.name.as_str()).collect()
    }

    fn scan(dir: &Path) -> ScanOutcome {
        scan_folder(dir).expect("folder exists")
    }

    #[test]
    fn folder_itself_is_repo() {
        let root = temp_dir();
        init_repo(root.path());
        fs::create_dir_all(root.path().join("nested")).unwrap();
        init_repo(&root.path().join("nested"));

        let outcome = scan(root.path());
        assert!(outcome.is_repo);
        assert_eq!(outcome.repos.len(), 1, "自身是仓库时只返回自己");
        assert_eq!(outcome.repos[0].path, root.path().to_string_lossy());
        assert_eq!(outcome.repos[0].name, dir_name(root.path()));
    }

    #[test]
    fn finds_nested_repos_and_stops_inside_repo() {
        let root = temp_dir();
        init_repo(&root.path().join("services/auth"));
        init_repo(&root.path().join("web"));
        // 已在仓库内部，不应继续深入
        init_repo(&root.path().join("web/vendor-lib"));

        let outcome = scan(root.path());
        assert!(!outcome.is_repo);
        assert_eq!(repo_paths(&outcome), vec!["services/auth", "web"]);
    }

    #[test]
    fn depth_is_limited_to_four() {
        let root = temp_dir();
        init_repo(&root.path().join("a/b/c/d"));
        init_repo(&root.path().join("a/b/c/d/e"));
        init_repo(&root.path().join("a/b/c/d/e/f"));

        let outcome = scan(root.path());
        assert_eq!(repo_paths(&outcome), vec!["a/b/c/d"]);
    }

    #[test]
    fn skips_hidden_and_dependency_dirs() {
        let root = temp_dir();
        init_repo(&root.path().join("node_modules/pkg"));
        init_repo(&root.path().join("target/debug"));
        init_repo(&root.path().join("Pods/Local"));
        init_repo(&root.path().join(".hidden/repo"));
        init_repo(&root.path().join("vendor/repo"));
        init_repo(&root.path().join("visible"));

        let outcome = scan(root.path());
        assert_eq!(repo_paths(&outcome), vec!["visible"]);
    }

    #[test]
    fn treats_git_file_as_repo() {
        let root = temp_dir();
        let worktree = root.path().join("wt");
        fs::create_dir_all(&worktree).unwrap();
        fs::write(worktree.join(".git"), "gitdir: /elsewhere/.git/worktrees/wt\n").unwrap();

        let outcome = scan(root.path());
        assert_eq!(repo_paths(&outcome), vec!["wt"]);
    }

    #[test]
    fn repo_names_use_forward_slashes_and_sort_case_insensitively() {
        let root = temp_dir();
        init_repo(&root.path().join("Beta"));
        init_repo(&root.path().join("alpha"));
        init_repo(&root.path().join("group/Charlie"));

        let outcome = scan(root.path());
        assert_eq!(repo_paths(&outcome), vec!["alpha", "Beta", "group/Charlie"]);
        assert!(outcome.repos.iter().all(|repo| !repo.name.contains('\\')));
    }

    #[test]
    fn missing_dir_returns_none() {
        let root = temp_dir();
        let missing = root.path().join("nope");
        assert!(scan_folder(&missing).is_none());

        let file = root.path().join("file.txt");
        fs::write(&file, "x").unwrap();
        assert!(scan_folder(&file).is_none());
    }

    #[test]
    fn empty_dir_has_no_repos() {
        let root = temp_dir();
        fs::create_dir_all(root.path().join("plain")).unwrap();
        let outcome = scan(root.path());
        assert!(!outcome.is_repo);
        assert!(outcome.repos.is_empty());
    }

    #[test]
    #[cfg(unix)]
    fn symlinked_dirs_are_not_followed() {
        let root = temp_dir();
        let outside = temp_dir();
        init_repo(&outside.path().join("linked-repo"));

        let link = root.path().join("link");
        std::os::unix::fs::symlink(outside.path(), &link).unwrap();

        let outcome = scan(root.path());
        assert!(outcome.repos.is_empty());
    }
}
