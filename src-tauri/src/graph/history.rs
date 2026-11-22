use std::collections::HashMap;
use std::path::Path;

use super::refs::{head, labels_by_hash, require_commit};
use super::types::{
    BranchFilter, CommitDetail, CommitFile, CommitPage, CommitQuery, CommitSummary, FileChangeKind,
};
use crate::error::{AppError, AppResult};
use crate::git::{git, FileDiff};

// With -z, Git also terminates each tformat record with NUL; user text may contain newlines or U+001F.
const SUMMARY: &str = "--format=%H%x00%h%x00%P%x00%s%x00%an%x00%ae%x00%at";

pub(super) fn commits(repo: &Path, query: CommitQuery) -> AppResult<CommitPage> {
    let head = head(repo)?;
    let mut log = git(repo).args([
        "log",
        "--topo-order",
        "--no-patch",
        "--no-color",
        "--encoding=UTF-8",
        "-z",
        SUMMARY,
    ]);
    log = match query.filter {
        BranchFilter::All => log.args(["--branches", "--remotes", "--tags"]),
        BranchFilter::Local => log.arg("--branches"),
        BranchFilter::Remote => log.arg("--remotes"),
        BranchFilter::Tags => log.arg("--tags"),
        BranchFilter::Ref { ref reference } => log.arg(require_commit(repo, reference)?),
    };
    if matches!(query.filter, BranchFilter::All | BranchFilter::Local) {
        if let Some(hash) = &head.hash {
            log = log.arg(hash);
        }
    }
    let raw = log
        .args([
            format!("--skip={}", query.skip),
            format!("--max-count={}", u64::from(query.limit) + 1),
            "--".into(),
        ])
        .run()?;
    let mut fields = raw.split_terminator('\0').peekable();
    let mut commits = Vec::new();
    while commits.len() < query.limit as usize && fields.peek().is_some() {
        commits.push(parse_summary(&mut fields)?);
    }
    let has_more = fields.peek().is_some();
    if !commits.is_empty() {
        let mut labels = labels_by_hash(repo, head)?;
        for commit in &mut commits {
            commit.refs = labels.remove(&commit.hash).unwrap_or_default();
        }
    }
    Ok(CommitPage { commits, has_more })
}

pub(super) fn commit_detail(repo: &Path, revision: &str) -> AppResult<CommitDetail> {
    let hash = require_commit(repo, revision)?;
    let format = format!("{SUMMARY}%x00%cn%x00%ce%x00%ct%x00%B");
    let raw = git(repo)
        .args([
            "log",
            "-1",
            "--no-patch",
            "--no-color",
            "--encoding=UTF-8",
            "-z",
            &format,
            &hash,
            "--",
        ])
        .run()?;
    let mut fields = raw.split_terminator('\0');
    let mut summary = parse_summary(&mut fields)?;
    let committer_name = field(&mut fields)?.into();
    let committer_email = field(&mut fields)?.into();
    let commit_time = timestamp(field(&mut fields)?)?;
    let message = field(&mut fields)?;
    let (title, body) = message.split_once('\n').unwrap_or((message, ""));
    summary.subject = title.trim_end_matches('\r').into();
    let body = body
        .strip_prefix("\r\n")
        .or_else(|| body.strip_prefix('\n'))
        .unwrap_or(body);
    let body = body.strip_suffix('\n').unwrap_or(body).to_owned();

    let files = commit_files(repo, &hash, summary.parents.first().map(String::as_str))?;
    summary.refs = labels_by_hash(repo, head(repo)?)?
        .remove(&hash)
        .unwrap_or_default();
    Ok(CommitDetail {
        summary,
        body,
        committer_name,
        committer_email,
        commit_time,
        files,
    })
}

pub(super) fn commit_file_diff(
    repo: &Path,
    revision: &str,
    path: String,
    old_path: Option<String>,
) -> AppResult<FileDiff> {
    let hash = require_commit(repo, revision)?;
    let parents = git(repo)
        .args(["log", "-1", "--no-patch", "--format=%P", &hash, "--"])
        .run()?;
    let parent = parents.split_whitespace().next();
    let mut diff = diff_tree(repo, &hash, parent, "-p").arg(&path);
    if let Some(old) = &old_path {
        diff = diff.arg(old);
    }
    let raw = diff.run_bytes()?;
    Ok(FileDiff::from_patch(path, old_path, &raw))
}

fn parse_summary<'a>(fields: &mut impl Iterator<Item = &'a str>) -> AppResult<CommitSummary> {
    Ok(CommitSummary {
        hash: field(fields)?.into(),
        short_hash: field(fields)?.into(),
        parents: field(fields)?
            .split_whitespace()
            .map(str::to_owned)
            .collect(),
        subject: field(fields)?.into(),
        author_name: field(fields)?.into(),
        author_email: field(fields)?.into(),
        author_time: timestamp(field(fields)?)?,
        refs: Vec::new(),
    })
}

fn field<'a>(fields: &mut impl Iterator<Item = &'a str>) -> AppResult<&'a str> {
    fields
        .next()
        .ok_or_else(|| AppError::Internal("无法解析 Git 输出字段".into()))
}

fn timestamp(value: &str) -> AppResult<i64> {
    value
        .parse()
        .map_err(|_| AppError::Internal("无法解析提交时间".into()))
}

// --root compares a root commit to the empty tree for either repository object format.
fn diff_tree(
    repo: &Path,
    hash: &str,
    parent: Option<&str>,
    format: &str,
) -> crate::git::runner::Git {
    let mut diff = git(repo).args([
        "--literal-pathspecs",
        "diff-tree",
        "--root",
        "--no-commit-id",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--no-relative",
        "-r",
        "-z",
        "-M",
        format,
    ]);
    if let Some(parent) = parent {
        diff = diff.arg(parent);
    }
    diff.args([hash, "--"])
}

fn commit_files(repo: &Path, hash: &str, parent: Option<&str>) -> AppResult<Vec<CommitFile>> {
    let stats_raw = diff_tree(repo, hash, parent, "--numstat").run()?;
    let mut stats = HashMap::new();
    let mut fields = stats_raw.split_terminator('\0');
    while let Some(stat) = fields.next() {
        let mut columns = stat.splitn(3, '\t');
        let additions = field(&mut columns)?.parse().ok();
        let deletions = field(&mut columns)?.parse().ok();
        let path = field(&mut columns)?;
        let path = if path.is_empty() {
            // Rename/copy numstat records put both paths in separate NUL-terminated fields.
            field(&mut fields)?;
            field(&mut fields)?
        } else {
            path
        };
        stats.insert(path, (additions, deletions));
    }

    let status_raw = diff_tree(repo, hash, parent, "--name-status").run()?;
    let mut fields = status_raw.split_terminator('\0');
    let mut files = Vec::new();
    while let Some(status) = fields.next() {
        let kind = match status.as_bytes().first() {
            Some(b'A') => FileChangeKind::Added,
            Some(b'M') => FileChangeKind::Modified,
            Some(b'D') => FileChangeKind::Deleted,
            Some(b'R') => FileChangeKind::Renamed,
            Some(b'C') => FileChangeKind::Copied,
            Some(b'T') => FileChangeKind::TypeChanged,
            Some(b'U') => FileChangeKind::Unmerged,
            _ => FileChangeKind::Unknown,
        };
        let first_path = field(&mut fields)?;
        let (path, old_path) = if matches!(kind, FileChangeKind::Renamed | FileChangeKind::Copied) {
            (field(&mut fields)?, Some(first_path.into()))
        } else {
            (first_path, None)
        };
        let (additions, deletions) = stats.remove(path).unwrap_or_default();
        files.push(CommitFile {
            path: path.into(),
            old_path,
            kind,
            additions,
            deletions,
        });
    }
    Ok(files)
}
