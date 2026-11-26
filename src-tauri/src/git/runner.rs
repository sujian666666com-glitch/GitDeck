//! git CLI 调用封装。
//!
//! ```ignore
//! let out = git(repo_path).args(["status", "--porcelain=v2", "-z"]).run_bytes()?;
//! let head = git(repo_path).args(["rev-parse", "HEAD"]).run()?;
//! let res = git(repo_path).args(["fetch", "--prune"]).timeout(NETWORK_TIMEOUT).run()?;
//! ```
//!
//! 统一处理：
//! - `GIT_TERMINAL_PROMPT=0`：需要凭据时直接失败，不会卡在终端提示；
//! - `LC_ALL=C`：git 输出与报错固定为英文，便于判断（界面文案自行翻译）；
//! - `-c core.quotepath=false -c color.ui=false -c log.showSignature=false`：路径不转义、无颜色、无签名输出；
//! - 超时后结束进程并返回错误；Windows 下不弹出控制台窗口；macOS 补齐 Homebrew 的 PATH。

use std::ffi::{OsStr, OsString};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use wait_timeout::ChildExt;

use crate::error::{AppError, AppResult};

/// 本地命令默认超时
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);
/// 网络命令（fetch / pull / push）建议超时
pub const NETWORK_TIMEOUT: Duration = Duration::from_secs(300);

const BASE_ARGS: [&str; 6] = [
    "-c",
    "core.quotepath=false",
    "-c",
    "color.ui=false",
    "-c",
    "log.showSignature=false",
];

/// 一次 git 调用的完整结果（不论退出码）
#[derive(Debug, Clone)]
pub struct GitOutput {
    /// 退出码；被信号终止时为 None
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

impl GitOutput {
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }

    pub fn stdout_text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }
}

/// git 调用构建器，见模块文档
#[must_use]
pub struct Git {
    cwd: PathBuf,
    args: Vec<OsString>,
    envs: Vec<(OsString, OsString)>,
    stdin: Option<Vec<u8>>,
    stdout_limit: u64,
    timeout: Duration,
}

/// 在 `cwd`（通常是仓库根目录）下准备执行 git
pub fn git(cwd: impl AsRef<Path>) -> Git {
    Git {
        cwd: cwd.as_ref().to_path_buf(),
        args: Vec::new(),
        envs: Vec::new(),
        stdin: None,
        stdout_limit: u64::MAX,
        timeout: DEFAULT_TIMEOUT,
    }
}

impl Git {
    pub fn arg(mut self, arg: impl AsRef<OsStr>) -> Self {
        self.args.push(arg.as_ref().to_os_string());
        self
    }

    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.args.extend(args.into_iter().map(|a| a.as_ref().to_os_string()));
        self
    }

    pub fn env(mut self, key: impl AsRef<OsStr>, value: impl AsRef<OsStr>) -> Self {
        self.envs.push((key.as_ref().to_os_string(), value.as_ref().to_os_string()));
        self
    }

    /// 通过 stdin 传入内容（例如 `commit -F -` 传提交信息）
    pub fn stdin(mut self, input: impl Into<Vec<u8>>) -> Self {
        self.stdin = Some(input.into());
        self
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// 只保留 stdout 的前缀，其余输出继续排空，避免 git 因管道写满而阻塞。
    pub fn stdout_limit(mut self, bytes: usize) -> Self {
        self.stdout_limit = bytes as u64;
        self
    }

    /// 执行并要求退出码为 0，返回 stdout 文本（非法 UTF-8 字节会被替换）
    pub fn run(self) -> AppResult<String> {
        self.run_bytes().map(|out| String::from_utf8_lossy(&out).into_owned())
    }

    /// 执行并要求退出码为 0，返回原始 stdout（解析 `-z` 输出时使用）
    pub fn run_bytes(self) -> AppResult<Vec<u8>> {
        let summary = self.summary();
        let out = self.output()?;
        if out.success() {
            Ok(out.stdout)
        } else {
            Err(failure(&summary, &out))
        }
    }

    /// 执行但不检查退出码（如 `diff --no-index` 有差异时返回 1）
    pub fn output(self) -> AppResult<GitOutput> {
        let summary = self.summary();
        let mut cmd = Command::new("git");
        cmd.current_dir(&self.cwd)
            .args(BASE_ARGS)
            .args(&self.args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("LC_ALL", "C")
            .stdin(if self.stdin.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(path) = augmented_path() {
            cmd.env("PATH", path);
        }
        for (key, value) in &self.envs {
            cmd.env(key, value);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd.spawn().map_err(|err| {
            if err.kind() == std::io::ErrorKind::NotFound {
                if self.cwd.is_dir() {
                    AppError::Git {
                        message: "未找到 git 命令，请先安装 Git 并确保它在 PATH 中".into(),
                        detail: err.to_string(),
                    }
                } else {
                    AppError::NotFound(format!("目录不存在：{}", self.cwd.display()))
                }
            } else {
                AppError::Io(err)
            }
        })?;

        // stdin / stdout / stderr 各用一个线程，避免管道写满互相阻塞
        if let (Some(input), Some(mut pipe)) = (self.stdin, child.stdin.take()) {
            thread::spawn(move || {
                let _ = pipe.write_all(&input);
            });
        }
        let stdout_reader = child.stdout.take().map(|mut pipe| {
            thread::spawn(move || {
                let mut buf = Vec::new();
                let _ = pipe.by_ref().take(self.stdout_limit).read_to_end(&mut buf);
                if buf.len() as u64 == self.stdout_limit {
                    let _ = std::io::copy(&mut pipe, &mut std::io::sink());
                }
                buf
            })
        });
        let stderr_reader = child.stderr.take().map(|mut pipe| {
            thread::spawn(move || {
                let mut buf = Vec::new();
                let _ = pipe.read_to_end(&mut buf);
                buf
            })
        });

        let status = match child.wait_timeout(self.timeout)? {
            Some(status) => status,
            None => {
                let _ = child.kill();
                let _ = child.wait();
                // 读线程可能被孙进程（如 ssh）占住的管道阻塞，这里不再等待它们
                return Err(AppError::Git {
                    message: format!("git 操作超时（{} 秒）", self.timeout.as_secs()),
                    detail: summary,
                });
            }
        };

        let stdout = stdout_reader.and_then(|h| h.join().ok()).unwrap_or_default();
        let stderr = stderr_reader.and_then(|h| h.join().ok()).unwrap_or_default();
        Ok(GitOutput { code: status.code(), stdout, stderr: String::from_utf8_lossy(&stderr).into_owned() })
    }

    fn summary(&self) -> String {
        let mut text = String::from("git");
        for arg in &self.args {
            text.push(' ');
            text.push_str(&arg.to_string_lossy());
        }
        if text.chars().count() > 200 {
            text = text.chars().take(200).collect::<String>() + "…";
        }
        text
    }
}

/// 把失败的 git 调用转成 AppError：message 取 stderr 中最关键的一行
fn failure(summary: &str, out: &GitOutput) -> AppError {
    let message = summarize_stderr(&out.stderr).unwrap_or_else(|| match out.code {
        Some(code) => format!("git 命令失败（退出码 {code}）"),
        None => "git 命令被中断".to_string(),
    });
    let detail = if out.stderr.trim().is_empty() {
        summary.to_string()
    } else {
        format!("{summary}\n{}", out.stderr.trim_end())
    };
    AppError::Git { message, detail }
}

/// 优先取 `fatal:` / `error:` 开头的行，去掉前缀；否则取第一行非空内容
pub fn summarize_stderr(stderr: &str) -> Option<String> {
    let lines: Vec<&str> = stderr.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let key = lines
        .iter()
        .find(|l| l.starts_with("fatal:") || l.starts_with("error:"))
        .or_else(|| lines.first())?;
    let text = key.trim_start_matches("fatal:").trim_start_matches("error:").trim();
    Some(text.to_string())
}

/// macOS 从 Finder 启动时 PATH 很短，补上 Homebrew 目录，便于找到 git-lfs、凭据助手等
fn augmented_path() -> Option<&'static OsString> {
    #[cfg(target_os = "macos")]
    {
        use std::sync::OnceLock;
        static PATH: OnceLock<Option<OsString>> = OnceLock::new();
        PATH.get_or_init(|| {
            let current = std::env::var_os("PATH").unwrap_or_default();
            let mut paths: Vec<PathBuf> = std::env::split_paths(&current).collect();
            let mut changed = false;
            for extra in ["/opt/homebrew/bin", "/usr/local/bin"] {
                let dir = PathBuf::from(extra);
                if dir.is_dir() && !paths.contains(&dir) {
                    paths.push(dir);
                    changed = true;
                }
            }
            if changed {
                std::env::join_paths(paths).ok()
            } else {
                None
            }
        })
        .as_ref()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testutil::TempRepo;

    #[test]
    fn runs_git_and_returns_stdout() {
        let repo = TempRepo::new();
        let out = git(repo.path()).args(["rev-parse", "--is-inside-work-tree"]).run().unwrap();
        assert_eq!(out.trim(), "true");
    }

    #[test]
    fn maps_failure_to_git_error_with_summary() {
        let dir = tempfile::tempdir().unwrap();
        let err = git(dir.path()).args(["rev-parse", "HEAD"]).run().unwrap_err();
        match err {
            AppError::Git { message, detail } => {
                assert!(message.contains("not a git repository"), "message = {message}");
                assert!(!message.starts_with("fatal:"));
                assert!(detail.starts_with("git rev-parse HEAD"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn output_does_not_fail_on_nonzero_exit() {
        let dir = tempfile::tempdir().unwrap();
        let out = git(dir.path()).args(["rev-parse", "HEAD"]).output().unwrap();
        assert!(!out.success());
        assert!(out.stderr.contains("not a git repository"));
    }

    #[test]
    fn passes_stdin() {
        let repo = TempRepo::new();
        let hash = git(repo.path()).args(["hash-object", "--stdin"]).stdin("hello\n").run().unwrap();
        assert_eq!(hash.trim(), "ce013625030ba8dba906f756967f9e9ca394464a");
    }

    #[test]
    fn missing_directory_is_not_found() {
        let err = git("/definitely/not/here/gitdeck").args(["status"]).run().unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)), "{err:?}");
    }

    #[cfg(unix)]
    #[test]
    fn kills_command_after_timeout() {
        let repo = TempRepo::new();
        let started = std::time::Instant::now();
        let err = git(repo.path())
            .args(["-c", "alias.nap=!sleep 5", "nap"])
            .timeout(Duration::from_millis(300))
            .run()
            .unwrap_err();
        assert!(started.elapsed() < Duration::from_secs(3));
        assert!(err.to_string().contains("超时"), "{err}");
    }

    #[test]
    fn summarizes_stderr() {
        assert_eq!(
            summarize_stderr("hint: x\nfatal: bad revision 'nope'\n").as_deref(),
            Some("bad revision 'nope'")
        );
        assert_eq!(summarize_stderr("\n  warning only \n").as_deref(), Some("warning only"));
        assert_eq!(summarize_stderr("  \n"), None);
    }
}
