use std::collections::HashMap;
use std::path::Path;

use super::types::{HeadInfo, LocalBranch, RefKind, RefLabel, RemoteBranch, RepoRefs, TagRef};
use crate::error::{AppError, AppResult};
use crate::git::{git, GitOutput};

const HEADS: &str = "refs/heads/";
const REMOTES: &str = "refs/remotes/";
const TAGS: &str = "refs/tags/";

pub(super) fn head(repo: &Path) -> AppResult<HeadInfo> {
    let symbolic = git(repo)
        .args(["symbolic-ref", "--quiet", "HEAD"])
        .output()?;
    let branch = match symbolic.code {
        Some(0) => symbolic
            .stdout_text()
            .trim()
            .strip_prefix(HEADS)
            .map(str::to_owned),
        Some(1) => None,
        _ => return Err(git_error("读取当前分支失败", &symbolic)),
    };
    let hash = resolve_commit(repo, "HEAD")?;
    Ok(HeadInfo {
        detached: branch.is_none() && hash.is_some(),
        branch,
        hash,
    })
}

pub(super) fn resolve_commit(repo: &Path, revision: &str) -> AppResult<Option<String>> {
    let spec = format!("{revision}^{{commit}}");
    let out = git(repo)
        .args([
            "rev-parse",
            "--verify",
            "--quiet",
            "--end-of-options",
            &spec,
        ])
        .output()?;
    match out.code {
        Some(0) => Ok(Some(out.stdout_text().trim().to_owned())),
        Some(1) => Ok(None),
        _ => Err(git_error("读取提交引用失败", &out)),
    }
}

pub(super) fn require_commit(repo: &Path, revision: &str) -> AppResult<String> {
    if revision.is_empty() || revision.starts_with('-') {
        return Err(AppError::invalid("无效的提交引用"));
    }
    resolve_commit(repo, revision)?
        .ok_or_else(|| AppError::NotFound(format!("找不到提交引用：{revision}")))
}

pub(super) fn git_error(message: &str, out: &GitOutput) -> AppError {
    let detail = if out.stderr.is_empty() {
        out.stdout_text().trim_end().to_owned()
    } else {
        out.stderr.trim_end().to_owned()
    };
    AppError::Git {
        message: message.into(),
        detail,
    }
}

pub(super) fn repo_refs(repo: &Path) -> AppResult<RepoRefs> {
    read_refs(repo, head(repo)?, true)
}

pub(super) fn labels_by_hash(
    repo: &Path,
    head: HeadInfo,
) -> AppResult<HashMap<String, Vec<RefLabel>>> {
    let refs = read_refs(repo, head, false)?;
    Ok(ref_labels(refs))
}

fn read_refs(repo: &Path, head: HeadInfo, tracking: bool) -> AppResult<RepoRefs> {
    let mut format = "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(symref)".to_owned();
    if tracking {
        format.push_str("%00%(upstream)%00%(upstream:track)");
    }
    let raw = git(repo)
        .args([
            "for-each-ref",
            "--sort=refname",
            &format,
            HEADS,
            REMOTES,
            TAGS,
        ])
        .run()?;

    let mut refs = RepoRefs {
        head,
        locals: Vec::new(),
        remotes: Vec::new(),
        tags: Vec::new(),
    };
    for line in raw.lines() {
        let mut fields = line.split('\0');
        let (
            Some(full_name),
            Some(hash),
            Some(kind),
            Some(peeled),
            Some(peeled_kind),
            Some(symref),
        ) = (
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
        )
        else {
            return Err(AppError::Internal("无法解析 Git 引用".into()));
        };
        if let Some(name) = full_name.strip_prefix(HEADS) {
            let upstream = fields
                .next()
                .filter(|value| !value.is_empty())
                .map(|value| {
                    value
                        .strip_prefix(REMOTES)
                        .or_else(|| value.strip_prefix(HEADS))
                        .unwrap_or(value)
                        .to_owned()
                });
            let (ahead, behind) = tracking_counts(fields.next().unwrap_or_default());
            refs.locals.push(LocalBranch {
                name: name.into(),
                hash: hash.into(),
                is_current: refs.head.branch.as_deref() == Some(name),
                upstream,
                ahead,
                behind,
            });
        } else if let Some(name) = full_name.strip_prefix(REMOTES) {
            if let Some((remote, branch)) = name.split_once('/') {
                if branch == "HEAD" && !symref.is_empty() {
                    continue;
                }
                refs.remotes.push(RemoteBranch {
                    name: name.into(),
                    remote: remote.into(),
                    hash: hash.into(),
                });
            }
        } else if let Some(name) = full_name.strip_prefix(TAGS) {
            let target = match (kind, peeled_kind) {
                ("commit", _) => Some(hash.into()),
                ("tag", "commit") => Some(peeled.into()),
                ("tag", "tag") => resolve_commit(repo, full_name)?,
                _ => None,
            };
            if let Some(hash) = target {
                refs.tags.push(TagRef {
                    name: name.into(),
                    hash,
                });
            }
        }
    }
    Ok(refs)
}

fn tracking_counts(track: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;
    for field in track.trim_matches(['[', ']']).split(", ") {
        match field.split_once(' ') {
            Some(("ahead", count)) => ahead = count.parse().unwrap_or_default(),
            Some(("behind", count)) => behind = count.parse().unwrap_or_default(),
            _ => {}
        }
    }
    (ahead, behind)
}

fn ref_labels(refs: RepoRefs) -> HashMap<String, Vec<RefLabel>> {
    let mut labels = HashMap::<String, Vec<RefLabel>>::new();
    if refs.head.detached {
        if let Some(hash) = refs.head.hash {
            labels.entry(hash).or_default().push(RefLabel {
                name: "HEAD".into(),
                full_name: "HEAD".into(),
                kind: RefKind::Head,
                is_current: true,
            });
        }
    }
    for local in refs.locals {
        let label = RefLabel {
            full_name: format!("{HEADS}{}", local.name),
            name: local.name,
            kind: RefKind::Local,
            is_current: local.is_current,
        };
        let list = labels.entry(local.hash).or_default();
        if label.is_current {
            list.insert(0, label);
        } else {
            list.push(label);
        }
    }
    for remote in refs.remotes {
        labels.entry(remote.hash).or_default().push(RefLabel {
            full_name: format!("{REMOTES}{}", remote.name),
            name: remote.name,
            kind: RefKind::Remote,
            is_current: false,
        });
    }
    for tag in refs.tags {
        labels.entry(tag.hash).or_default().push(RefLabel {
            full_name: format!("{TAGS}{}", tag.name),
            name: tag.name,
            kind: RefKind::Tag,
            is_current: false,
        });
    }
    labels
}
