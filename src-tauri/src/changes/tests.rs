use super::commit::create_commit;
use super::diff::get_file_diff;
use super::remote::{fetch_remote, pull_remote, push_remote};
use super::stage::{discard_paths, stage_paths, unstage_paths};
use super::status::{get_repo_status, parse_status_output};
use super::types::ChangeKind;
use crate::git::git;
use crate::git::testutil::TempRepo;

#[test]
fn test_parse_status_output_comprehensive() {
    let raw = b"# branch.oid 1122334455667788990011223344556677889900\0\
# branch.head feature/\xe6\xb5\x8b\xe8\xaf\x95\0\
# branch.upstream origin/feature/\xe6\xb5\x8b\xe8\xaf\x95\0\
# branch.ab +3 -2\0\
1 M. N... 100644 100644 100644 1111 2222 src/modified.rs\0\
1 A. N... 000000 100644 100644 0000 2222 src/added.rs\0\
1 D. N... 100644 000000 000000 1111 0000 src/deleted.rs\0\
1 .M N... 100644 100644 100644 1111 2222 src/worktree_mod.rs\0\
1 MM N... 100644 100644 100644 1111 2222 src/partially staged.rs\0\
2 R. N... 100644 100644 100644 1111 2222 R100 \xe8\xb7\xaf\xe5\xbe\x84/\xe6\x96\xb0\xe5\x90\x8d\xe5\xad\x97.rs\0\xe8\xb7\xaf\xe5\xbe\x84/\xe6\x97\xa7\xe5\x90\x8d\xe5\xad\x97.rs\0\
? \xe6\x9c\xaa\xe8\xb7\x9f\xe8\xb8\xaa/\xe6\x96\xb0 \xe6\x96\x87\xe4\xbb\xb6.txt\0\
u UU N... 100644 100644 100644 100644 1111 2222 3333 conflict.txt\0";

    let parsed = parse_status_output(raw);

    assert_eq!(parsed.head_hash.as_deref(), Some("1122334455667788990011223344556677889900"));
    assert_eq!(parsed.branch.as_deref(), Some("feature/测试"));
    assert_eq!(parsed.upstream.as_deref(), Some("origin/feature/测试"));
    assert_eq!(parsed.ahead, 3);
    assert_eq!(parsed.behind, 2);

    // Staged list checks
    let staged_paths: Vec<(&str, ChangeKind)> = parsed.staged.iter().map(|f| (f.path.as_str(), f.kind)).collect();
    assert!(staged_paths.contains(&("src/modified.rs", ChangeKind::Modified)));
    assert!(staged_paths.contains(&("src/added.rs", ChangeKind::Added)));
    assert!(staged_paths.contains(&("src/deleted.rs", ChangeKind::Deleted)));
    assert!(staged_paths.contains(&("src/partially staged.rs", ChangeKind::Modified)));
    assert!(staged_paths.contains(&("路径/新名字.rs", ChangeKind::Renamed)));

    let renamed = parsed.staged.iter().find(|f| f.path == "路径/新名字.rs").unwrap();
    assert_eq!(renamed.old_path.as_deref(), Some("路径/旧名字.rs"));

    // Unstaged list checks
    let unstaged_paths: Vec<(&str, ChangeKind)> = parsed.unstaged.iter().map(|f| (f.path.as_str(), f.kind)).collect();
    assert!(unstaged_paths.contains(&("src/worktree_mod.rs", ChangeKind::Modified)));
    assert!(unstaged_paths.contains(&("src/partially staged.rs", ChangeKind::Modified)));
    assert!(unstaged_paths.contains(&("未跟踪/新 文件.txt", ChangeKind::Untracked)));

    // Conflicted list checks
    let conflicted_paths: Vec<(&str, ChangeKind)> = parsed.conflicted.iter().map(|f| (f.path.as_str(), f.kind)).collect();
    assert_eq!(conflicted_paths, vec![("conflict.txt", ChangeKind::Conflicted)]);
}

#[test]
fn test_parse_status_empty_repo() {
    let raw = b"# branch.oid (initial)\0# branch.head main\0";
    let parsed = parse_status_output(raw);

    assert_eq!(parsed.head_hash, None);
    assert_eq!(parsed.branch.as_deref(), Some("main"));
    assert_eq!(parsed.upstream, None);
    assert_eq!(parsed.ahead, 0);
    assert_eq!(parsed.behind, 0);
    assert!(parsed.staged.is_empty());
    assert!(parsed.unstaged.is_empty());
    assert!(parsed.conflicted.is_empty());
}

#[test]
fn test_status_real_repo() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    // 空仓库初始状态
    let s0 = get_repo_status(repo_path).unwrap();
    assert_eq!(s0.head_hash, None);
    assert_eq!(s0.branch.as_deref(), Some("main"));
    assert!(!s0.has_remote);

    // 写入文件并提交
    repo.write("a.txt", "line1\n");
    repo.commit_all("initial");

    let s1 = get_repo_status(repo_path).unwrap();
    assert!(s1.head_hash.is_some());
    assert!(s1.staged.is_empty());
    assert!(s1.unstaged.is_empty());

    // 创建各种修改
    repo.write("a.txt", "line1\nline2\n"); // modified
    repo.write("b.txt", "new untracked\n"); // untracked
    repo.write("c.txt", "to stage\n");

    let s2 = get_repo_status(repo_path).unwrap();
    assert_eq!(s2.unstaged.len(), 3);
    assert!(s2.staged.is_empty());

    // 暂存 c.txt
    stage_paths(repo_path, &["c.txt".into()]).unwrap();
    let s3 = get_repo_status(repo_path).unwrap();
    assert_eq!(s3.staged.len(), 1);
    assert_eq!(s3.staged[0].path, "c.txt");
    assert_eq!(s3.staged[0].kind, ChangeKind::Added);
}

#[test]
fn test_stage_unstage_discard() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    repo.write("src/a.txt", "original a\n");
    repo.write("src/b.txt", "original b\n");
    repo.commit_all("commit 1");

    // 修改并新增未跟踪文件
    repo.write("src/a.txt", "modified a\n");
    repo.write("src/未跟踪 文件.txt", "untracked\n");

    // 暂存 a.txt
    stage_paths(repo_path, &["src/a.txt".into()]).unwrap();
    let s = get_repo_status(repo_path).unwrap();
    assert!(s.staged.iter().any(|f| f.path == "src/a.txt"));

    // 取消暂存
    unstage_paths(repo_path, &["src/a.txt".into()]).unwrap();
    let s = get_repo_status(repo_path).unwrap();
    assert!(s.staged.is_empty());
    assert!(s.unstaged.iter().any(|f| f.path == "src/a.txt"));

    // 丢弃修改（包含未跟踪文件）
    discard_paths(repo_path, &["src/a.txt".into(), "src/未跟踪 文件.txt".into()]).unwrap();
    let s = get_repo_status(repo_path).unwrap();
    assert!(s.unstaged.is_empty());
    assert!(!repo.path().join("src/未跟踪 文件.txt").exists());
}

#[test]
fn test_empty_repo_unstage() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    repo.write("init.txt", "content\n");
    stage_paths(repo_path, &["init.txt".into()]).unwrap();

    let s = get_repo_status(repo_path).unwrap();
    assert_eq!(s.staged.len(), 1);

    // 空仓库无 HEAD 情况下取消暂存
    unstage_paths(repo_path, &["init.txt".into()]).unwrap();
    let s = get_repo_status(repo_path).unwrap();
    assert!(s.staged.is_empty());
    assert_eq!(s.unstaged.len(), 1);
}

#[test]
fn test_file_diff() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    repo.write("doc.txt", "hello\n");
    repo.commit_all("init");

    // 未暂存修改的 Diff
    repo.write("doc.txt", "hello\nworld\n");
    let diff = get_file_diff(repo_path, "doc.txt", false).unwrap();
    assert!(!diff.binary);
    assert!(diff.patch.contains("+world"));

    // 暂存后的 Diff
    stage_paths(repo_path, &["doc.txt".into()]).unwrap();
    let diff_staged = get_file_diff(repo_path, "doc.txt", true).unwrap();
    assert!(diff_staged.patch.contains("+world"));

    // 未跟踪文件的 Diff
    repo.write("untracked.txt", "first line\n");
    let diff_untracked = get_file_diff(repo_path, "untracked.txt", false).unwrap();
    assert!(!diff_untracked.binary);
    assert!(diff_untracked.patch.contains("+first line"));

    // 二进制文件
    std::fs::write(repo.path().join("image.bin"), [0u8, 159, 255, 0, 1]).unwrap();
    let diff_bin = get_file_diff(repo_path, "image.bin", false).unwrap();
    assert!(diff_bin.binary);
}

#[test]
fn test_commit_normal_smart_amend() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    // 空信息提交报错
    let err = create_commit(repo_path, "", false).unwrap_err();
    assert!(err.to_string().contains("提交信息不能为空"));

    // 无任何更改提交报错
    let err = create_commit(repo_path, "test", false).unwrap_err();
    assert!(err.to_string().contains("没有可提交的更改"));

    // 智能提交：未暂存直接提交全部
    repo.write("file1.txt", "content 1\n");
    repo.write("file2.txt", "content 2\n");
    let res = create_commit(repo_path, "feat: 首次提交", false).unwrap();
    assert_eq!(res.summary, "feat: 首次提交");
    assert!(!res.hash.is_empty());

    let s = get_repo_status(repo_path).unwrap();
    assert!(s.staged.is_empty());
    assert!(s.unstaged.is_empty());

    // 普通暂存后提交
    repo.write("file1.txt", "content 1 updated\n");
    stage_paths(repo_path, &["file1.txt".into()]).unwrap();
    let res2 = create_commit(repo_path, "fix: 更新 file1", false).unwrap();
    assert_eq!(res2.summary, "fix: 更新 file1");

    // amend 修改提交信息
    let res_amend = create_commit(repo_path, "fix: 更新 file1 (修改)", true).unwrap();
    assert_eq!(res_amend.summary, "fix: 更新 file1 (修改)");

    // amend 允许空信息（沿用旧信息）
    let res_amend_noedit = create_commit(repo_path, "", true).unwrap();
    assert_eq!(res_amend_noedit.summary, "fix: 更新 file1 (修改)");
}

#[test]
fn test_remote_fetch_pull_push() {
    let temp_dir = tempfile::tempdir().unwrap();
    let bare_dir = temp_dir.path().join("bare.git");
    std::fs::create_dir_all(&bare_dir).unwrap();

    // 创建本地 bare 远程仓库
    let out = std::process::Command::new("git")
        .args(["init", "--bare", "-b", "main"])
        .current_dir(&bare_dir)
        .output()
        .unwrap();
    assert!(out.status.success());

    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    // 添加远程仓库 origin
    git(repo.path())
        .args(["remote", "add", "origin", bare_dir.to_str().unwrap()])
        .run()
        .unwrap();

    repo.write("README.md", "# Bare Test\n");
    create_commit(repo_path, "init commit", false).unwrap();

    // 首次推送（自动设置上游）
    push_remote(repo_path).unwrap();
    let s = get_repo_status(repo_path).unwrap();
    assert_eq!(s.upstream.as_deref(), Some("origin/main"));
    assert_eq!(s.ahead, 0);

    // Fetch
    fetch_remote(repo_path).unwrap();

    // Pull
    pull_remote(repo_path).unwrap();
}
