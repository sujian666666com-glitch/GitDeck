//! 测试工具：在临时目录创建隔离的 git 仓库。各模块的 Rust 测试共用。
//!
//! ```ignore
//! let repo = TempRepo::new();
//! repo.write("src/a.txt", "hello\n");
//! let hash = repo.commit_all("init");
//! repo.git(&["switch", "-c", "feature"]);
//! ```

use std::path::Path;
use std::process::Command;

pub struct TempRepo {
    dir: tempfile::TempDir,
}

impl Default for TempRepo {
    fn default() -> Self {
        Self::new()
    }
}

impl TempRepo {
    /// `git init -b main`，并设置本仓库级别的身份与隔离配置（不受用户全局 hooks / 签名影响）
    pub fn new() -> Self {
        let repo = Self { dir: tempfile::tempdir().expect("create temp dir") };
        repo.git(&["init", "-q", "-b", "main"]);
        let hooks = repo.path().join(".git").join("no-hooks");
        for (key, value) in [
            ("user.name", "GitDeck Test"),
            ("user.email", "test@gitdeck.local"),
            ("commit.gpgsign", "false"),
            ("tag.gpgsign", "false"),
            ("core.autocrlf", "false"),
            ("core.hooksPath", hooks.to_str().expect("utf-8 temp path")),
        ] {
            repo.git(&["config", key, value]);
        }
        repo
    }

    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    /// 直接执行 git（不经过 runner），失败时 panic，返回 stdout
    pub fn git(&self, args: &[&str]) -> String {
        let out = Command::new("git")
            .current_dir(self.path())
            .args(args)
            .env("LC_ALL", "C")
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .expect("spawn git");
        assert!(
            out.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    /// 写入文件（自动创建父目录）
    pub fn write(&self, rel: &str, content: &str) {
        let path = self.path().join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create parent dir");
        }
        std::fs::write(path, content).expect("write file");
    }

    /// `git add -A && git commit`，返回新提交的完整哈希
    pub fn commit_all(&self, message: &str) -> String {
        self.git(&["add", "-A"]);
        self.git(&["commit", "-q", "--allow-empty", "-m", message]);
        self.git(&["rev-parse", "HEAD"]).trim().to_string()
    }
}
