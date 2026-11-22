use super::types::{BranchFilter, CommitPage, CommitQuery, FileChangeKind, MergeOutcome, RefKind};
use super::{branches, history, refs};
use crate::error::AppError;
use crate::git::testutil::TempRepo;

fn page(repo: &TempRepo, filter: BranchFilter, skip: u32, limit: u32) -> CommitPage {
    history::commits(
        repo.path(),
        CommitQuery {
            filter,
            skip,
            limit,
        },
    )
    .unwrap()
}

#[test]
fn reads_empty_history_and_filters_a_detached_root() {
    let repo = TempRepo::new();
    for filter in [
        BranchFilter::All,
        BranchFilter::Local,
        BranchFilter::Remote,
        BranchFilter::Tags,
    ] {
        let page = page(&repo, filter, 0, 400);
        assert!(page.commits.is_empty() && !page.has_more);
    }
    let head = refs::repo_refs(repo.path()).unwrap().head;
    assert_eq!(head.branch.as_deref(), Some("main"));
    assert_eq!(head.hash, None);

    let root = repo.commit_all("root");
    repo.git(&["switch", "--detach", &root]);
    repo.git(&["branch", "-D", "main"]);
    assert_eq!(page(&repo, BranchFilter::All, 0, 10).commits[0].hash, root);
    assert_eq!(
        page(&repo, BranchFilter::Local, 0, 10).commits[0].hash,
        root
    );
    assert!(page(&repo, BranchFilter::Remote, 0, 10).commits.is_empty());
    assert!(page(&repo, BranchFilter::Tags, 0, 10).commits.is_empty());
}

#[test]
fn parses_log_and_details_with_multiline_and_separator_characters() {
    let repo = TempRepo::new();
    repo.git(&["config", "user.name", "提交\u{1f}者"]);
    repo.git(&[
        "commit",
        "--allow-empty",
        "--cleanup=verbatim",
        "--author",
        "作\u{1f}者 <author@example.com>",
        "-m",
        "提交\u{1f} `特殊字符`\n标题续行\n\n正文第一行\t中文\n第二行\u{1f}\n",
    ]);
    let loaded = page(&repo, BranchFilter::All, 0, 1);
    assert!(!loaded.has_more);
    let summary = &loaded.commits[0];
    assert_eq!(summary.subject, "提交\u{1f} `特殊字符` 标题续行");
    assert_eq!(summary.author_name, "作\u{1f}者");
    assert_eq!(summary.author_email, "author@example.com");
    assert!(summary.author_time > 0);
    let detail = history::commit_detail(repo.path(), &summary.hash).unwrap();
    assert_eq!(detail.summary.subject, "提交\u{1f} `特殊字符`");
    assert_eq!(detail.body, "标题续行\n\n正文第一行\t中文\n第二行\u{1f}");
    assert_eq!(detail.committer_name, "提交\u{1f}者");
    assert_eq!(detail.committer_email, "test@gitdeck.local");
    assert!(detail.commit_time > 0);
}

#[test]
fn paginates_and_filters_refs_without_including_stash() {
    let repo = TempRepo::new();
    let root = repo.commit_all("root");
    let local = repo.commit_all("local");
    repo.git(&["switch", "-c", "other", &root]);
    let remote = repo.commit_all("remote");
    repo.git(&["update-ref", "refs/remotes/origin/topic", &remote]);
    repo.git(&["switch", "main"]);
    repo.git(&["branch", "-D", "other"]);
    repo.git(&["switch", "-c", "temporary", &root]);
    let tag = repo.commit_all("tagged");
    repo.git(&["tag", "-a", "v1", "-m", "release", &tag]);
    repo.git(&["switch", "main"]);
    repo.git(&["branch", "-D", "temporary"]);
    repo.write("untracked.txt", "temporary");
    repo.git(&["stash", "push", "-u"]);

    let all = page(&repo, BranchFilter::All, 0, 10);
    assert_eq!(all.commits.len(), 4);
    assert_eq!(all.commits[3].hash, root);
    let first = page(&repo, BranchFilter::All, 0, 2);
    let second = page(&repo, BranchFilter::All, 2, 2);
    assert!(first.has_more && !second.has_more);
    assert_eq!([first.commits, second.commits].concat(), all.commits);
    assert!(page(&repo, BranchFilter::All, 10, 2).commits.is_empty());
    for (filter, expected) in [
        (BranchFilter::Local, local),
        (BranchFilter::Remote, remote.clone()),
        (BranchFilter::Tags, tag),
        (
            BranchFilter::Ref {
                reference: "refs/remotes/origin/topic".into(),
            },
            remote,
        ),
    ] {
        let page = page(&repo, filter, 0, 10);
        assert_eq!(page.commits.len(), 2);
        assert_eq!(page.commits[0].hash, expected);
    }
    let invalid = history::commits(
        repo.path(),
        CommitQuery {
            filter: BranchFilter::Ref {
                reference: "missing".into(),
            },
            skip: 0,
            limit: 10,
        },
    )
    .unwrap_err();
    assert!(matches!(invalid, AppError::NotFound(_)));
}

#[test]
fn maps_ordered_refs_with_tracking_and_detached_head() {
    let repo = TempRepo::new();
    let root = repo.commit_all("root");
    let main = repo.commit_all("local");
    repo.git(&["branch", "aaa", &main]);
    repo.git(&["remote", "add", "origin", "."]);
    repo.git(&["update-ref", "refs/remotes/origin/main", &root]);
    repo.git(&["update-ref", "refs/remotes/origin/topic", &main]);
    repo.git(&[
        "symbolic-ref",
        "refs/remotes/origin/HEAD",
        "refs/remotes/origin/main",
    ]);
    repo.git(&["branch", "--set-upstream-to=origin/main", "main"]);
    repo.git(&["tag", "-a", "v1", "-m", "release", &main]);
    repo.git(&["tag", "v2", &main]);
    let labels = page(&repo, BranchFilter::All, 0, 10).commits.remove(0).refs;
    assert_eq!(
        labels
            .iter()
            .map(|label| (label.name.as_str(), label.kind))
            .collect::<Vec<_>>(),
        [
            ("main", RefKind::Local),
            ("aaa", RefKind::Local),
            ("origin/topic", RefKind::Remote),
            ("v1", RefKind::Tag),
            ("v2", RefKind::Tag)
        ]
    );
    assert!(labels[0].is_current);
    let refs = refs::repo_refs(repo.path()).unwrap();
    assert_eq!(refs.remotes.len(), 2);
    let current = refs.locals.iter().find(|branch| branch.is_current).unwrap();
    assert_eq!(current.upstream.as_deref(), Some("origin/main"));
    assert_eq!((current.ahead, current.behind), (1, 0));
    assert_eq!(refs.tags[0].hash, main);

    repo.git(&["switch", "-c", "other", &root]);
    let remote_commit = repo.commit_all("advance remote");
    repo.git(&["update-ref", "refs/remotes/origin/main", &remote_commit]);
    let refs = refs::repo_refs(repo.path()).unwrap();
    let local = refs
        .locals
        .iter()
        .find(|branch| branch.name == "main")
        .unwrap();
    assert_eq!((local.ahead, local.behind), (1, 1));

    repo.git(&["switch", "--detach", &main]);
    let detached = repo.commit_all("detached only");
    let head = super::refs::repo_refs(repo.path()).unwrap().head;
    assert!(head.detached);
    assert_eq!(head.hash.as_deref(), Some(detached.as_str()));
    let page = page(&repo, BranchFilter::Local, 0, 10);
    let detached_commit = page
        .commits
        .iter()
        .find(|commit| commit.hash == detached)
        .unwrap();
    assert_eq!(detached_commit.refs[0].kind, RefKind::Head);
    assert!(detached_commit.refs[0].is_current);
}

#[test]
fn reads_root_rename_and_binary_details_and_literal_file_diffs() {
    let repo = TempRepo::new();
    // The tab exercises numstat framing. The asterisk must be a literal pathspec.
    let old = "旧目录/old\t*.txt";
    let new = "新目录/new\t*.txt";
    repo.write(old, "first\nsecond\nthird\n");
    repo.write("旧目录/old\tother.txt", "another file\n");
    repo.write("asset.bin", "\0\x01\x02");
    let root = repo.commit_all("root");
    let root_detail = history::commit_detail(repo.path(), &root).unwrap();
    assert!(root_detail.summary.parents.is_empty());
    let file = root_detail
        .files
        .iter()
        .find(|file| file.path == old)
        .unwrap();
    assert_eq!(
        (file.kind, file.additions, file.deletions),
        (FileChangeKind::Added, Some(3), Some(0))
    );
    let binary = root_detail
        .files
        .iter()
        .find(|file| file.path == "asset.bin")
        .unwrap();
    assert_eq!((binary.additions, binary.deletions), (None, None));
    let diff = history::commit_file_diff(repo.path(), &root, old.into(), None).unwrap();
    assert!(diff.patch.contains("+first"));
    assert!(!diff.patch.contains("another file"));
    let binary_diff =
        history::commit_file_diff(repo.path(), &root, "asset.bin".into(), None).unwrap();
    assert!(binary_diff.binary && binary_diff.patch.is_empty());

    repo.write(new, "first\nsecond\nthird\n");
    std::fs::remove_file(repo.path().join(old)).unwrap();
    let renamed = repo.commit_all("rename");
    let detail = history::commit_detail(repo.path(), &renamed).unwrap();
    assert_eq!(detail.summary.parents, [root]);
    assert_eq!(detail.files.len(), 1);
    let file = &detail.files[0];
    assert_eq!(file.path, new);
    assert_eq!(file.old_path.as_deref(), Some(old));
    assert_eq!(
        (file.kind, file.additions, file.deletions),
        (FileChangeKind::Renamed, Some(0), Some(0))
    );
    let diff = history::commit_file_diff(repo.path(), &renamed, new.into(), file.old_path.clone())
        .unwrap();
    assert!(diff.patch.contains("rename from") && diff.patch.contains("rename to"));

    repo.write(new, "first\nupdated\nthird\n");
    let modified = repo.commit_all("modify");
    let detail = history::commit_detail(repo.path(), &modified).unwrap();
    assert_eq!(
        (
            detail.files[0].kind,
            detail.files[0].additions,
            detail.files[0].deletions
        ),
        (FileChangeKind::Modified, Some(1), Some(1))
    );
    let diff = history::commit_file_diff(repo.path(), &modified, new.into(), None).unwrap();
    assert!(diff.patch.contains("-second") && diff.patch.contains("+updated"));
}

#[test]
fn creates_switches_and_deletes_local_branches() {
    let repo = TempRepo::new();
    let base = repo.commit_all("root");
    let repo_path = repo.path();
    branches::create(repo_path, "test", Some(&base), true).unwrap();
    assert_eq!(
        refs::head(repo_path).unwrap().branch.as_deref(),
        Some("test")
    );
    assert!(branches::delete(repo_path, "test", true)
        .unwrap_err()
        .to_string()
        .contains("工作树"));
    repo.write("test.txt", "test");
    repo.commit_all("test branch");
    branches::checkout(repo_path, "main").unwrap();
    let error = branches::delete(repo_path, "test", false).unwrap_err();
    assert!(error.to_string().contains("分支尚未合并"));
    assert!(matches!(error, AppError::Git { detail, .. } if detail.contains("not fully merged")));
    branches::delete(repo_path, "test", true).unwrap();

    branches::create(repo_path, "merged", None, false).unwrap();
    assert_eq!(
        refs::head(repo_path).unwrap().branch.as_deref(),
        Some("main")
    );
    branches::delete(repo_path, "merged", false).unwrap();
    assert!(matches!(
        branches::checkout(repo_path, "-C"),
        Err(AppError::Invalid(_))
    ));

    repo.write("shared.txt", "main");
    repo.commit_all("main shared file");
    branches::create(repo_path, "other", None, true).unwrap();
    repo.write("shared.txt", "other");
    repo.commit_all("other shared file");
    repo.write("shared.txt", "uncommitted");
    let error = branches::checkout(repo_path, "main").unwrap_err();
    assert_eq!(
        error.to_string(),
        "切换失败：有未提交的修改会被覆盖，请先提交或暂存"
    );
}

#[test]
fn checks_out_remote_with_default_and_explicit_tracking_names() {
    let repo = TempRepo::new();
    let hash = repo.commit_all("root");
    repo.git(&["remote", "add", "origin", "."]);
    repo.git(&["update-ref", "refs/remotes/origin/team/topic", &hash]);
    branches::checkout_remote(repo.path(), "origin/team/topic", Some("")).unwrap();
    let refs = refs::repo_refs(repo.path()).unwrap();
    let local = refs.locals.iter().find(|branch| branch.is_current).unwrap();
    assert_eq!(local.name, "team/topic");
    assert_eq!(local.upstream.as_deref(), Some("origin/team/topic"));
    let error = branches::checkout_remote(repo.path(), "origin/team/topic", None).unwrap_err();
    assert!(error.to_string().contains("本地同名分支已存在"));
    branches::checkout_remote(
        repo.path(),
        "refs/remotes/origin/team/topic",
        Some("another"),
    )
    .unwrap();
    assert_eq!(
        refs::head(repo.path()).unwrap().branch.as_deref(),
        Some("another")
    );
}

#[test]
fn classifies_fast_forward_and_up_to_date_and_honors_no_ff() {
    let repo = TempRepo::new();
    repo.commit_all("root");
    repo.git(&["config", "merge.ff", "false"]);
    branches::create(repo.path(), "topic", None, true).unwrap();
    let target = repo.commit_all("topic");
    branches::checkout(repo.path(), "main").unwrap();
    let result = branches::merge(repo.path(), "topic", false).unwrap();
    assert_eq!(result.outcome, MergeOutcome::FastForward);
    assert_eq!(
        refs::head(repo.path()).unwrap().hash.as_deref(),
        Some(target.as_str())
    );
    let result = branches::merge(repo.path(), "topic", true).unwrap();
    assert_eq!(result.outcome, MergeOutcome::UpToDate);

    repo.git(&["config", "merge.ff", "only"]);
    branches::create(repo.path(), "next", None, true).unwrap();
    let next = repo.commit_all("next");
    branches::checkout(repo.path(), "main").unwrap();
    let result = branches::merge(repo.path(), "next", true).unwrap();
    assert_eq!(result.outcome, MergeOutcome::Merged);
    let detail = history::commit_detail(repo.path(), "HEAD").unwrap();
    assert_eq!(detail.summary.parents, [target, next]);
}

#[test]
fn merges_and_reports_the_delta_to_first_parent() {
    let repo = TempRepo::new();
    repo.commit_all("root");
    branches::create(repo.path(), "topic", None, true).unwrap();
    repo.write("topic.txt", "topic\n");
    let topic = repo.commit_all("topic");
    branches::checkout(repo.path(), "main").unwrap();
    repo.write("main.txt", "main\n");
    let main = repo.commit_all("main");
    let result = branches::merge(repo.path(), "topic", true).unwrap();
    assert_eq!(result.outcome, MergeOutcome::Merged);
    let detail = history::commit_detail(repo.path(), "HEAD").unwrap();
    assert_eq!(detail.summary.parents, [main, topic]);
    assert_eq!(detail.files.len(), 1);
    assert_eq!(detail.files[0].path, "topic.txt");
    let diff = history::commit_file_diff(repo.path(), "HEAD", "topic.txt".into(), None).unwrap();
    assert!(diff.patch.contains("+topic"));
}

#[test]
fn leaves_merge_conflicts_for_changes_to_resolve() {
    let repo = TempRepo::new();
    repo.write("conflict.txt", "base\n");
    repo.commit_all("root");
    branches::create(repo.path(), "topic", None, true).unwrap();
    repo.write("conflict.txt", "topic\n");
    let topic = repo.commit_all("topic");
    branches::checkout(repo.path(), "main").unwrap();
    repo.write("conflict.txt", "main\n");
    let main = repo.commit_all("main");
    let result = branches::merge(repo.path(), "topic", true).unwrap();
    assert_eq!(result.outcome, MergeOutcome::Conflicts);
    assert!(result.message.contains("Changes"));
    assert_eq!(repo.git(&["rev-parse", "MERGE_HEAD"]).trim(), topic);
    assert_eq!(refs::head(repo.path()).unwrap().hash, Some(main));
    assert!(repo.git(&["ls-files", "-u"]).contains("conflict.txt"));
    let error = branches::merge(repo.path(), "topic", true).unwrap_err();
    assert!(error.to_string().contains("请先在 Changes 中解决冲突"));
}
