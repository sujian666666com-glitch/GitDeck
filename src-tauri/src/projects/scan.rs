//! 仓库识别：递归扫描一个文件夹，找出其中的 Git 仓库。
//!
//! 规则（与产品约定一致）：
//! - 目录下存在 `.git`（**普通目录或普通文件**，兼容 worktree / submodule）即为仓库；
//!   悬空或指向别处的 `.git` 链接不算；
//! - 被添加的文件夹本身是仓库时，只返回它自己；
//! - 被添加的文件夹如果现在是符号链接（原目录被替换），视为不可用，不扫描；
//! - 否则递归子目录，最大深度 4（相对被添加文件夹的路径层数），识别到仓库后不再深入；
//! - 跳过隐藏目录、常见依赖 / 构建目录、符号链接与 Windows 目录联接，
//!   无权限读取的目录直接跳过；
//! - 遍历有访问预算（最多 `MAX_SCAN_DIRS` 个目录），超出后停止并标记 `truncated`。

use std::fs;
use std::path::{Path, PathBuf};

use super::paths;
use super::types::RepoNode;

/// 递归扫描的最大深度：仓库相对被添加文件夹的路径最多 4 层
pub const MAX_DEPTH: usize = 4;

/// 单次扫描最多访问的目录数（防止一层里有海量目录、或网络目录拖住扫描）
pub const MAX_SCAN_DIRS: usize = 20_000;

/// 跳过的大型依赖 / 构建目录（`.venv` 之类隐藏目录由「以 . 开头」规则跳过）
const SKIP_DIRS: [&str; 8] = ["node_modules", "target", "dist", "build", "vendor", "venv", "Pods", "__pycache__"];

/// 一次扫描的结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanOutcome {
    /// 被扫描的目录本身就是一个仓库
    pub is_repo: bool,
    /// 识别到的仓库（按名称不区分大小写排序）
    pub repos: Vec<RepoNode>,
    /// 访问预算用尽，`repos` 只是部分结果
    pub truncated: bool,
}

/// 扫描目录。返回 `None` 表示目录不存在、不是目录，或已被替换成符号链接。
pub fn scan_folder(path: &Path) -> Option<ScanOutcome> {
    scan_folder_with_budget(path, MAX_SCAN_DIRS)
}

/// 指定访问预算扫描（便于测试，也便于将来调参）
pub fn scan_folder_with_budget(path: &Path, max_dirs: usize) -> Option<ScanOutcome> {
    // 不跟随最终链接：已保存的目录被替换成链接时视为不可用
    let meta = fs::symlink_metadata(path).ok()?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return None;
    }

    if is_repo(path) {
        return Some(ScanOutcome {
            is_repo: true,
            repos: vec![RepoNode { path: paths::path_string(path), name: dir_name(path) }],
            truncated: false,
        });
    }

    let mut walker = Walker { root: path.to_path_buf(), repos: Vec::new(), budget: max_dirs, truncated: false };
    walker.walk(path, 0);

    let mut repos = walker.repos;
    repos.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
    Some(ScanOutcome { is_repo: false, repos, truncated: walker.truncated })
}

/// 目录下是否有 `.git`：只接受普通目录 / 普通文件，链接（含悬空链接）不算
fn is_repo(dir: &Path) -> bool {
    match fs::symlink_metadata(dir.join(".git")) {
        Ok(meta) => {
            let file_type = meta.file_type();
            file_type.is_dir() || file_type.is_file()
        }
        Err(_) => false,
    }
}

struct Walker {
    root: PathBuf,
    repos: Vec<RepoNode>,
    budget: usize,
    truncated: bool,
}

impl Walker {
    fn walk(&mut self, dir: &Path, depth: usize) {
        if depth >= MAX_DEPTH || self.truncated {
            return;
        }
        if self.budget == 0 {
            self.truncated = true;
            return;
        }
        self.budget -= 1;

        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            // 无权限、目录被删除等情况直接跳过
            Err(_) => return,
        };

        for entry in entries.flatten() {
            if self.truncated {
                return;
            }
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            // 符号链接的 file_type 是 symlink 而不是 dir，因此不会被跟随
            if !file_type.is_dir() {
                continue;
            }
            if skip_by_attributes(&entry) {
                continue;
            }

            let file_name = entry.file_name();
            if should_skip_name(&file_name) {
                continue;
            }

            let child = entry.path();
            if is_repo(&child) {
                self.repos.push(RepoNode {
                    name: relative_name(&self.root, &child),
                    path: paths::path_string(&child),
                });
            } else {
                // 预算用尽时由 walk 标记 truncated 并返回，父层在下一轮检查时停止
                self.walk(&child, depth + 1);
            }
        }
    }
}

fn should_skip_name(name: &std::ffi::OsStr) -> bool {
    let name = name.to_string_lossy();
    if name.starts_with('.') {
        return true;
    }
    SKIP_DIRS.iter().any(|skip| name.eq_ignore_ascii_case(skip))
}

/// Windows：跳过带隐藏 / 系统属性的目录，以及目录联接等重解析点
#[cfg(windows)]
fn skip_by_attributes(entry: &fs::DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

    match entry.metadata() {
        Ok(meta) => {
            let attrs = meta.file_attributes();
            attrs & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM | FILE_ATTRIBUTE_REPARSE_POINT) != 0
        }
        // 拿不到属性时不额外跳过，交给后续 read_dir 的失败处理
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn skip_by_attributes(_entry: &fs::DirEntry) -> bool {
    false
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
        .unwrap_or_else(|| paths::path_string(path))
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
        assert!(!outcome.truncated);
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
        // 第 4 层：命中
        init_repo(&root.path().join("a/b/c/d"));
        // 第 5 层：独立路径，不应命中
        init_repo(&root.path().join("x1/x2/x3/x4/repo5"));
        // 第 6 层：独立路径，不应命中
        init_repo(&root.path().join("y1/y2/y3/y4/y5/repo6"));

        let outcome = scan(root.path());
        assert_eq!(repo_paths(&outcome), vec!["a/b/c/d"]);
        assert!(!outcome.truncated);
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
    #[cfg(unix)]
    fn git_symlink_is_not_a_repo() {
        let root = temp_dir();
        let dangling = root.path().join("dangling");
        fs::create_dir_all(&dangling).unwrap();
        std::os::unix::fs::symlink("/nonexistent/.git", dangling.join(".git")).unwrap();
        // 悬空 .git 不算仓库，也不应阻止继续寻找下层仓库
        init_repo(&dangling.join("inner"));

        let elsewhere = root.path().join("elsewhere");
        fs::create_dir_all(&elsewhere).unwrap();
        std::os::unix::fs::symlink(root.path().join("dangling/.git"), elsewhere.join(".git")).unwrap();

        let outcome = scan(root.path());
        assert_eq!(repo_paths(&outcome), vec!["dangling/inner"]);
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
        assert!(!outcome.truncated);
    }

    #[test]
    #[cfg(unix)]
    fn synced_root_symlink_is_not_scanned() {
        let root = temp_dir();
        let outside = temp_dir();
        init_repo(&outside.path().join("linked-repo"));

        let link = root.path().join("link");
        std::os::unix::fs::symlink(outside.path(), &link).unwrap();

        // 根目录是链接：视为不可用
        assert!(scan_folder(&link).is_none());
        // 遍历过程中遇到链接目录：不跟随
        let outcome = scan(root.path());
        assert!(outcome.repos.is_empty());
    }

    #[test]
    fn visit_budget_stops_scan_and_reports_partial_result() {
        let root = temp_dir();
        // 宽目录：30 个分组目录，每个里面一个仓库（每进入一个目录消耗 1 次预算）
        for index in 0..30 {
            init_repo(&root.path().join(format!("group-{index:02}/repo")));
        }

        // 预算 5：根目录 + 4 个分组目录，只能看到部分结果
        let partial = scan_folder_with_budget(root.path(), 5).expect("folder exists");
        assert!(partial.truncated, "预算用尽时必须标记部分结果");
        assert!(!partial.repos.is_empty(), "应返回已发现的部分结果");
        assert!(partial.repos.len() < 30, "不应扫描完全部仓库");

        // 预算充足：全部命中且未截断
        let full = scan_folder_with_budget(root.path(), MAX_SCAN_DIRS).expect("folder exists");
        assert!(!full.truncated);
        assert_eq!(full.repos.len(), 30);
    }

    #[test]
    fn visit_budget_counts_directories_not_entries() {
        let root = temp_dir();
        // 一层宽目录：根 + n 个子目录
        for index in 0..10 {
            fs::create_dir_all(root.path().join(format!("plain-{index}"))).unwrap();
        }
        init_repo(&root.path().join("repo"));

        let outcome = scan_folder_with_budget(root.path(), 11).expect("folder exists");
        assert!(!outcome.truncated, "预算刚好覆盖根 + 10 个子目录");
        assert_eq!(repo_paths(&outcome), vec!["repo"]);

        let limited = scan_folder_with_budget(root.path(), 3).expect("folder exists");
        assert!(limited.truncated);
    }
}
