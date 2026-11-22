use std::path::Path;
use super::types::{ChangeKind, RepoOperation, RepoStatus, StatusFile};
use crate::error::AppResult;
use crate::git::git;

pub fn char_to_change_kind(c: char) -> ChangeKind {
    match c {
        'M' => ChangeKind::Modified,
        'A' => ChangeKind::Added,
        'D' => ChangeKind::Deleted,
        'R' => ChangeKind::Renamed,
        'C' => ChangeKind::Copied,
        'T' => ChangeKind::TypeChanged,
        'U' | 'u' => ChangeKind::Conflicted,
        '?' => ChangeKind::Untracked,
        _ => ChangeKind::Modified,
    }
}

pub struct ParsedStatus {
    pub branch: Option<String>,
    pub head_hash: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub unreadable_paths: u32,
    pub staged: Vec<StatusFile>,
    pub unstaged: Vec<StatusFile>,
    pub conflicted: Vec<StatusFile>,
}

pub fn parse_status_output(bytes: &[u8]) -> ParsedStatus {
    let mut branch = None;
    let mut head_hash = None;
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut unreadable_paths = 0;
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut conflicted = Vec::new();

    let mut iter = bytes.split(|&b| b == 0);
    while let Some(item) = iter.next() {
        if item.is_empty() {
            continue;
        }
        let text = match std::str::from_utf8(item) {
            Ok(s) => s,
            Err(_) => {
                unreadable_paths += 1;
                continue;
            }
        };

        if let Some(rest) = text.strip_prefix("# ") {
            if let Some(oid) = rest.strip_prefix("branch.oid ") {
                let trimmed = oid.trim();
                if trimmed != "(initial)" && !trimmed.is_empty() {
                    head_hash = Some(trimmed.to_string());
                }
            } else if let Some(head) = rest.strip_prefix("branch.head ") {
                let trimmed = head.trim();
                if trimmed != "(detached)" && !trimmed.is_empty() {
                    branch = Some(trimmed.to_string());
                }
            } else if let Some(up) = rest.strip_prefix("branch.upstream ") {
                let trimmed = up.trim();
                if !trimmed.is_empty() {
                    upstream = Some(trimmed.to_string());
                }
            } else if let Some(ab) = rest.strip_prefix("branch.ab ") {
                for part in ab.split_whitespace() {
                    if let Some(a) = part.strip_prefix('+') {
                        ahead = a.parse::<u32>().unwrap_or(0);
                    } else if let Some(b) = part.strip_prefix('-') {
                        behind = b.parse::<u32>().unwrap_or(0);
                    }
                }
            }
            continue;
        }

        if text.starts_with("1 ") {
            let parts: Vec<&str> = text.splitn(9, ' ').collect();
            if parts.len() == 9 {
                let xy = parts[1];
                let path = parts[8].to_string();
                let mut chars = xy.chars();
                let x = chars.next().unwrap_or('.');
                let y = chars.next().unwrap_or('.');
                if x != '.' {
                    staged.push(StatusFile {
                        path: path.clone(),
                        old_path: None,
                        kind: char_to_change_kind(x),
                    });
                }
                if y != '.' {
                    unstaged.push(StatusFile {
                        path,
                        old_path: None,
                        kind: char_to_change_kind(y),
                    });
                }
            }
        } else if text.starts_with("2 ") {
            let parts: Vec<&str> = text.splitn(10, ' ').collect();
            let orig_raw = iter.next();
            let orig_path = match orig_raw {
                Some(b) => match std::str::from_utf8(b) {
                    Ok(s) => Some(s.to_string()),
                    Err(_) => {
                        unreadable_paths += 1;
                        None
                    }
                },
                None => None,
            };
            if orig_raw.is_some() && orig_path.is_none() {
                // 原路径无法按 UTF-8 解码，跳过该条目
                continue;
            }
            if parts.len() == 10 {
                let xy = parts[1];
                let path = parts[9].to_string();
                let mut chars = xy.chars();
                let x = chars.next().unwrap_or('.');
                let y = chars.next().unwrap_or('.');
                if x != '.' {
                    staged.push(StatusFile {
                        path: path.clone(),
                        old_path: orig_path,
                        kind: char_to_change_kind(x),
                    });
                }
                if y != '.' {
                    unstaged.push(StatusFile {
                        path,
                        old_path: None,
                        kind: char_to_change_kind(y),
                    });
                }
            }
        } else if text.starts_with("u ") {
            let parts: Vec<&str> = text.splitn(11, ' ').collect();
            if parts.len() == 11 {
                let path = parts[10].to_string();
                conflicted.push(StatusFile {
                    path,
                    old_path: None,
                    kind: ChangeKind::Conflicted,
                });
            }
        } else if let Some(path) = text.strip_prefix("? ") {
            unstaged.push(StatusFile {
                path: path.to_string(),
                old_path: None,
                kind: ChangeKind::Untracked,
            });
        }
    }

    ParsedStatus {
        branch,
        head_hash,
        upstream,
        ahead,
        behind,
        unreadable_paths,
        staged,
        unstaged,
        conflicted,
    }
}

pub fn detect_operation(repo_path: &Path) -> Option<RepoOperation> {
    let out = git(repo_path)
        .args([
            "rev-parse",
            "--git-path",
            "rebase-merge",
            "--git-path",
            "rebase-apply",
            "--git-path",
            "MERGE_HEAD",
            "--git-path",
            "CHERRY_PICK_HEAD",
            "--git-path",
            "REVERT_HEAD",
        ])
        .run()
        .ok()?;

    let lines: Vec<&str> = out.lines().map(str::trim).collect();
    if lines.len() < 5 {
        return None;
    }

    let check_exists = |rel_or_abs: &str| -> bool {
        let p = Path::new(rel_or_abs);
        if p.is_absolute() {
            p.exists()
        } else {
            repo_path.join(p).exists()
        }
    };

    if check_exists(lines[0]) || check_exists(lines[1]) {
        Some(RepoOperation::Rebase)
    } else if check_exists(lines[2]) {
        Some(RepoOperation::Merge)
    } else if check_exists(lines[3]) {
        Some(RepoOperation::CherryPick)
    } else if check_exists(lines[4]) {
        Some(RepoOperation::Revert)
    } else {
        None
    }
}

pub fn check_has_remote(repo_path: &Path) -> bool {
    git(repo_path)
        .args(["remote"])
        .run()
        .map(|out| out.lines().any(|l| !l.trim().is_empty()))
        .unwrap_or(false)
}

pub fn get_repo_status(repo_path: &str) -> AppResult<RepoStatus> {
    let path = Path::new(repo_path);
    let bytes = git(path)
        .args([
            "--no-optional-locks",
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ])
        .run_bytes()?;

    let parsed = parse_status_output(&bytes);
    let operation = detect_operation(path);
    let has_remote = check_has_remote(path);

    Ok(RepoStatus {
        branch: parsed.branch,
        head_hash: parsed.head_hash,
        upstream: parsed.upstream,
        ahead: parsed.ahead,
        behind: parsed.behind,
        has_remote,
        unreadable_paths: parsed.unreadable_paths,
        staged: parsed.staged,
        unstaged: parsed.unstaged,
        conflicted: parsed.conflicted,
        operation,
    })
}
