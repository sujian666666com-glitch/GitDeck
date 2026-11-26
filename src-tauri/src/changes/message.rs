use std::io::Write;
use std::process::{Command, Stdio};

use serde_json::{json, Value};
use tauri::Url;

use super::diff::read_patch;
use super::status::get_repo_status;
use super::types::{ChangeKind, CommitAiConfig, RepoOperation};
use crate::error::{AppError, AppResult};
use crate::git::git;

const CONTEXT_BYTES: usize = 12 * 1024;
const PROMPT: &str = include_str!("commit-message-rules.md");
const TEST_STATUS: &str = "- 测试与验证：未提供测试结果。";

pub fn generate(repo_path: &str, config: CommitAiConfig) -> AppResult<String> {
    let url = completion_url(&config)?;
    let context = commit_context(repo_path)?;
    let body = json!({
        "model": config.model.trim(),
        "messages": [
            { "role": "system", "content": PROMPT },
            { "role": "user", "content": context },
        ],
    });
    let response = request_completion(&url, config.api_key.trim(), &body)?;
    format_message(&response)
}

fn completion_url(config: &CommitAiConfig) -> AppResult<Url> {
    if config.model.trim().is_empty() || config.base_url.trim().is_empty() {
        return Err(AppError::invalid(
            "请先在设置的「AI 提交信息」中填写 API 地址和模型名",
        ));
    }
    if config.api_key.trim().chars().any(char::is_control) {
        return Err(AppError::invalid("API Key 含有无效字符"));
    }
    let mut url =
        Url::parse(config.base_url.trim()).map_err(|_| AppError::invalid("API 地址无效"))?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::invalid("请填写 HTTP 或 HTTPS 的 API 基础地址"));
    }
    let path = url.path().trim_end_matches('/');
    let endpoint = if path.ends_with("/chat/completions") {
        path.to_owned()
    } else {
        format!("{path}/chat/completions")
    };
    url.set_path(&endpoint);
    Ok(url)
}

fn commit_context(repo_path: &str) -> AppResult<String> {
    let status = get_repo_status(repo_path)?;
    if !status.conflicted.is_empty() || status.operation == Some(RepoOperation::Rebase) {
        return Err(AppError::invalid("请先处理冲突或完成变基"));
    }
    let staged = !status.staged.is_empty();
    let files = if staged {
        status.staged
    } else {
        status.unstaged
    };
    if files.is_empty() {
        return Err(AppError::invalid("没有可生成提交信息的更改"));
    }

    let mut context = format!("共 {} 个变更文件（下附部分差异摘录）\n", files.len());
    for file in &files {
        if let Some(old) = &file.old_path {
            context.push_str(&format!("{:?} {old} -> {}\n", file.kind, file.path));
        } else {
            context.push_str(&format!("{:?} {}\n", file.kind, file.path));
        }
    }
    let samples = files.len().min(6);
    let budget = (CONTEXT_BYTES.saturating_sub(context.len()) / samples).min(4096);
    if budget < 256 {
        return Ok(context);
    }
    for slot in 0..samples {
        let file = &files[slot * files.len() / samples];
        // git 可能把内嵌仓库报告为一个未跟踪目录，只在清单中列出它。
        if file.path.ends_with('/') {
            continue;
        }
        let raw = read_patch(
            git(repo_path)
                .args(["--literal-pathspecs", "diff", "--no-textconv"])
                .stdout_limit(budget - 1),
            &file.path,
            file.old_path.as_deref(),
            staged,
            file.kind == ChangeKind::Untracked,
        )?;
        let patch = String::from_utf8_lossy(&raw);
        context.push('\n');
        context.push_str(&patch[..patch.floor_char_boundary((budget - 1).min(patch.len()))]);
    }
    Ok(context)
}

fn request_completion(url: &Url, key: &str, body: &Value) -> AppResult<String> {
    // curl 从 stdin 读取配置，密钥和差异不会出现在进程参数中。
    let mut input = format!("data-raw = {}\n", serde_json::to_string(&body.to_string())?);
    if !key.is_empty() {
        let header = serde_json::to_string(&format!("Authorization: Bearer {key}"))?;
        input.push_str(&format!("header = {header}\n"));
    }
    let mut cmd = Command::new("curl");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd
        .args([
            "--disable",
            "--silent",
            "--globoff",
            "--max-time",
            "45",
            "--max-filesize",
            "1048576",
            "--header",
            "Content-Type: application/json",
            "--write-out",
            "\n%{http_code}",
            "--config",
            "-",
            "--url",
            url.as_str(),
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| AppError::Config("无法启动系统 curl，请检查是否已安装".into()))?;
    let written = child.stdin.take().unwrap().write_all(input.as_bytes());
    let output = child.wait_with_output()?;
    if !output.status.success() {
        let msg = match output.status.code() {
            Some(28) => "模型请求超时，请重试",
            Some(60) => "模型服务证书验证失败",
            Some(63) => "模型返回的数据过大",
            _ => "无法连接模型服务，请检查 API 地址和网络",
        };
        return Err(AppError::invalid(msg));
    }
    written?;
    let response = String::from_utf8_lossy(&output.stdout);
    let (body, code) = response
        .rsplit_once('\n')
        .ok_or_else(|| AppError::invalid("模型响应格式无效"))?;
    if !code.starts_with('2') {
        return Err(AppError::invalid(format!(
            "模型服务返回 HTTP {code}，请检查 API 地址、模型名和 Key"
        )));
    }
    let json: Value =
        serde_json::from_str(body).map_err(|_| AppError::invalid("模型服务没有返回有效 JSON"))?;
    json.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(String::from)
        .ok_or_else(|| AppError::invalid("模型没有返回提交信息"))
}

fn format_message(text: &str) -> AppResult<String> {
    let invalid = || AppError::invalid("模型返回的提交信息不符合格式，请重新生成");
    let text = text.trim().replace("\r\n", "\n");
    let (title, body) = text.split_once('\n').unwrap_or((&text, ""));
    let (prefix, summary) = title.split_once(": ").ok_or_else(invalid)?;
    let (kind, scope) = prefix
        .strip_suffix(')')
        .and_then(|s| s.split_once('('))
        .ok_or_else(invalid)?;
    const TYPES: [&str; 11] = [
        "feat", "fix", "refactor", "perf", "style", "docs", "test", "build", "ci", "chore",
        "revert",
    ];
    let has_chinese = |line: &str| line.chars().any(|c| ('\u{3400}'..='\u{9fff}').contains(&c));
    if !TYPES.contains(&kind)
        || !scope.bytes().any(|c| c.is_ascii_alphabetic())
        || !scope
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_./".contains(&c))
        || !has_chinese(summary)
    {
        return Err(invalid());
    }
    if body.trim().is_empty() {
        return Ok(title.to_owned());
    }

    let mut lines = body.lines().map(str::trim).filter(|line| !line.is_empty());
    let id = lines
        .next()
        .and_then(|line| line.strip_prefix("change-id: "))
        .ok_or_else(invalid)?;
    if !id.bytes().any(|c| c.is_ascii_lowercase())
        || !id.split('-').all(|word| {
            !word.is_empty()
                && word
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
    {
        return Err(invalid());
    }
    let mut bullets = Vec::new();
    let mut has_status = false;
    for line in lines {
        let bullet = line.strip_prefix("- ").ok_or_else(invalid)?;
        if !has_chinese(bullet) {
            return Err(invalid());
        }
        if bullet.starts_with("测试与验证：") || bullet.starts_with("测试与验证:") {
            if !has_status {
                bullets.push(TEST_STATUS);
            }
            has_status = true;
        } else {
            bullets.push(line);
        }
    }
    if bullets.is_empty() || bullets.as_slice() == [TEST_STATUS] {
        return Err(invalid());
    }
    if !has_status {
        bullets.push(TEST_STATUS);
    }
    Ok(format!(
        "{title}\n\nchange-id: {id}\n\n{}",
        bullets.join("\n")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testutil::TempRepo;
    use std::io::{BufRead, BufReader, Read};
    use std::net::TcpListener;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn context_matches_smart_commit_without_staging() {
        let repo = TempRepo::new();
        let path = repo.path().to_str().unwrap();
        assert!(commit_context(path).is_err());
        repo.write("tracked.txt", "origin\n");
        repo.commit_all("init");
        repo.write("tracked.txt", "index-version\n");
        repo.git(&["add", "tracked.txt"]);
        repo.write("tracked.txt", "worktree-version\n");
        repo.write("new.txt", "untracked-version\n");
        let staged = commit_context(path).unwrap();
        assert!(staged.contains("+index-version"));
        assert!(!staged.contains("worktree-version") && !staged.contains("new.txt"));

        repo.git(&["reset", "-q", "HEAD", "--", "tracked.txt"]);
        let before = repo.git(&["status", "--porcelain"]);
        let all = commit_context(path).unwrap();
        assert!(all.contains("+worktree-version") && all.contains("+untracked-version"));
        assert_eq!(before, repo.git(&["status", "--porcelain"]));
    }

    #[test]
    fn caps_large_initial_commit_on_utf8_boundaries() {
        let repo = TempRepo::new();
        for i in 0..5 {
            repo.write(&format!("file-{i}"), &"文".repeat(30000));
        }
        repo.git(&["add", "-A"]);
        let context = commit_context(repo.path().to_str().unwrap()).unwrap();
        assert!(context.contains("共 5 个变更文件") && context.contains("文文文"));
        assert!(context.len() <= CONTEXT_BYTES);
    }

    #[test]
    fn formats_simple_and_complex_commit_messages() {
        let title = "fix(deploy): 修复部署锁";
        assert_eq!(format_message(title).unwrap(), title);
        let full = format!("{title}\n\nchange-id: retain-deploy-lock\n\n- 保留进行中作业的锁\n- 旧版本维护脚本需同步更新");
        assert_eq!(
            format_message(&full).unwrap(),
            format!("{full}\n{TEST_STATUS}")
        );
        let claimed = full.replace("- 旧版本", "- 测试与验证：本地 202 项测试通过\n- 旧版本");
        let draft = format_message(&claimed).unwrap();
        assert!(!draft.contains("202"));
        assert!(draft.contains(&format!("{TEST_STATUS}\n- 旧版本")));
        for bad in [
            "fix: 缺少模块",
            "misc(ui): 不支持的类型",
            "feat(界面): 更新按钮",
            "fix(ui): English only",
        ] {
            assert!(format_message(bad).is_err());
        }
        assert!(format_message(&full.replace("retain-deploy-lock", "retain_deploy_lock")).is_err());
    }

    #[test]
    fn posts_to_compatible_endpoint_and_reads_message() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}/v1/", listener.local_addr().unwrap());
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(&socket);
            let mut headers = String::new();
            while !headers.ends_with("\r\n\r\n") {
                assert!(reader.read_line(&mut headers).unwrap() > 0);
            }
            let headers = headers.to_ascii_lowercase();
            assert!(headers.starts_with("post /v1/chat/completions http/"));
            assert!(headers.contains("authorization: bearer test-key\r\n"));
            let size = headers
                .lines()
                .find_map(|line| line.strip_prefix("content-length: "))
                .unwrap();
            let mut bytes = vec![0; size.parse().unwrap()];
            reader.read_exact(&mut bytes).unwrap();
            let request: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(request["model"], "demo");
            assert!(request["messages"][1]["content"]
                .as_str()
                .unwrap()
                .contains("+打印 \"完成\""));
            let json = r#"{"choices":[{"message":{"content":"feat(cli): 输出完成提示"}}]}"#;
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{json}",
                json.len()
            )
            .unwrap();
        });
        let repo = TempRepo::new();
        repo.write("demo", "打印 \"完成\"\n");
        let config = CommitAiConfig {
            base_url,
            model: "demo".into(),
            api_key: "test-key".into(),
        };
        let result = generate(repo.path().to_str().unwrap(), config).unwrap();
        server.join().unwrap();
        assert_eq!(result, "feat(cli): 输出完成提示");
    }
}
