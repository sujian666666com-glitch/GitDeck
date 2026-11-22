use super::commit::create_commit;
use super::diff::get_file_diff;
use super::operation::{operation_abort, operation_continue};
use super::remote::{fetch_remote, map_network_error, pull_remote, push_remote};
use super::stage::{discard_paths, stage_paths, unstage_paths};
use super::status::{get_repo_status, parse_status_output};
use super::types::{ChangeKind, RepoOperation};
use crate::git::runner::GitOutput;
use crate::git::{git, testutil::TempRepo};

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
    assert_eq!(parsed.unreadable_paths, 0);

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
fn test_parse_status_unreadable_paths() {
    let raw = b"? \xff\xfe\xfd\0? valid.txt\0";
    let parsed = parse_status_output(raw);
    assert_eq!(parsed.unreadable_paths, 1);
    assert_eq!(parsed.unstaged.len(), 1);
    assert_eq!(parsed.unstaged[0].path, "valid.txt");
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
    assert_eq!(parsed.unreadable_paths, 0);
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
fn test_discard_safety_and_scenarios() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    repo.write("part.txt", "base content\n");
    repo.write("del.txt", "to delete\n");
    repo.commit_all("init");

    // 1. 部分暂存文件：工作区再次修改，丢弃工作区修改后暂存区内容仍在
    repo.write("part.txt", "staged change\n");
    stage_paths(repo_path, &["part.txt".into()]).unwrap();
    repo.write("part.txt", "staged change + worktree change\n");

    let s = get_repo_status(repo_path).unwrap();
    assert!(s.staged.iter().any(|f| f.path == "part.txt"));
    assert!(s.unstaged.iter().any(|f| f.path == "part.txt"));

    discard_paths(repo_path, &["part.txt".into()]).unwrap();
    let s_after = get_repo_status(repo_path).unwrap();
    // 工作区未暂存修改清空，但暂存内容仍在
    assert!(s_after.staged.iter().any(|f| f.path == "part.txt"));
    assert!(!s_after.unstaged.iter().any(|f| f.path == "part.txt"));
    let disk_content = std::fs::read_to_string(repo.path().join("part.txt")).unwrap();
    assert_eq!(disk_content, "staged change\n");

    // 2. 只丢弃同目录下一个未跟踪文件时，其他未跟踪文件依然保留
    repo.write("sub/u1.txt", "untracked 1\n");
    repo.write("sub/u2.txt", "untracked 2\n");
    assert!(repo.path().join("sub/u1.txt").exists());
    assert!(repo.path().join("sub/u2.txt").exists());

    discard_paths(repo_path, &["sub/u1.txt".into()]).unwrap();
    assert!(!repo.path().join("sub/u1.txt").exists());
    assert!(repo.path().join("sub/u2.txt").exists());

    // 3. 工作区删除的文件丢弃后被恢复
    std::fs::remove_file(repo.path().join("del.txt")).unwrap();
    let s_del = get_repo_status(repo_path).unwrap();
    assert!(s_del.unstaged.iter().any(|f| f.path == "del.txt" && f.kind == ChangeKind::Deleted));

    discard_paths(repo_path, &["del.txt".into()]).unwrap();
    assert!(repo.path().join("del.txt").exists());
    let s_restored = get_repo_status(repo_path).unwrap();
    assert!(!s_restored.unstaged.iter().any(|f| f.path == "del.txt"));
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
fn test_commit_multiline_chinese_and_hash_comments() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    repo.write("notes.txt", "hello\n");
    let msg = "feat: 支持复杂提交说明\n\n# 注释风格的内容行\n第二行正文\n测试中文 UTF-8\n";
    create_commit(repo_path, msg, false).unwrap();

    let raw_body = git(repo.path()).args(["log", "-1", "--format=%B"]).run().unwrap();
    assert!(raw_body.contains("# 注释风格的内容行"));
    assert!(raw_body.contains("第二行正文"));
    assert!(raw_body.contains("测试中文 UTF-8"));
}

#[test]
fn test_batch_staging_over_100_paths() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    let mut paths = Vec::new();
    for i in 0..120 {
        let name = format!("batch_files/file_{:03}.txt", i);
        repo.write(&name, "content\n");
        paths.push(name);
    }

    // 分批暂存 120 个路径
    stage_paths(repo_path, &paths).unwrap();
    let s = get_repo_status(repo_path).unwrap();
    assert_eq!(s.staged.len(), 120);

    // 分批取消暂存
    unstage_paths(repo_path, &paths).unwrap();
    let s_un = get_repo_status(repo_path).unwrap();
    assert!(s_un.staged.is_empty());
    assert_eq!(s_un.unstaged.len(), 120);
}

#[test]
fn test_merge_conflict_and_operations() {
    let repo = TempRepo::new();
    let repo_path = repo.path().to_str().unwrap();

    repo.write("conflict.txt", "base line\n");
    repo.commit_all("base commit");

    // 切到分支 feat 修改
    repo.git(&["switch", "-c", "feat"]);
    repo.write("conflict.txt", "feat line\n");
    repo.commit_all("feat commit");

    // 切回 main 修改相同行
    repo.git(&["switch", "main"]);
    repo.write("conflict.txt", "main line\n");
    repo.commit_all("main commit");

    // merge 产生冲突（通过 Command 调用允许退出码非 0）
    let _ = std::process::Command::new("git")
        .current_dir(repo.path())
        .args(["merge", "feat"])
        .env("LC_ALL", "C")
        .output();

    let s = get_repo_status(repo_path).unwrap();
    assert_eq!(s.operation, Some(RepoOperation::Merge));
    assert!(s.conflicted.iter().any(|f| f.path == "conflict.txt"));

    // merge 中 amend 应报错
    let amend_err = create_commit(repo_path, "amend on merge", true).unwrap_err();
    assert!(amend_err.to_string().contains("合并进行中无法修改提交"));

    // 测试 operation_abort
    operation_abort(repo_path).unwrap();
    let s_abort = get_repo_status(repo_path).unwrap();
    assert_eq!(s_abort.operation, None);

    // 重新制造冲突并解决后测试 operation_continue
    let _ = std::process::Command::new("git")
        .current_dir(repo.path())
        .args(["merge", "feat"])
        .env("LC_ALL", "C")
        .output();
    repo.write("conflict.txt", "resolved line\n");
    stage_paths(repo_path, &["conflict.txt".into()]).unwrap();

    operation_continue(repo_path).unwrap();
    let s_done = get_repo_status(repo_path).unwrap();
    assert_eq!(s_done.operation, None);
    assert!(s_done.conflicted.is_empty());
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

    // 配置 branch.main.rebase = true 测试 pull 策略
    git(repo.path())
        .args(["config", "branch.main.rebase", "true"])
        .run()
        .unwrap();

    // Fetch
    fetch_remote(repo_path).unwrap();

    // Pull
    pull_remote(repo_path).unwrap();
}

#[test]
fn test_network_error_mapping_categories() {
    let make_out = |stderr: &str| GitOutput {
        code: Some(1),
        stdout: Vec::new(),
        stderr: stderr.to_string(),
    };

    // non-fast-forward
    let err1 = map_network_error(&make_out("To origin\n ! [rejected] main -> main (non-fast-forward)"), "fail");
    assert!(err1.to_string().contains("推送被拒绝（远程分支包含本地尚未合并的提交）"));

    // remote rejected
    let err2 = map_network_error(&make_out("remote: error: hook declined to update refs/heads/main\n ! [remote rejected]"), "fail");
    assert!(err2.to_string().contains("推送被远程拒绝"));

    // src refspec
    let err3 = map_network_error(&make_out("error: src refspec HEAD does not match any"), "fail");
    assert!(err3.to_string().contains("当前分支还没有提交，无法推送"));

    // host key verification failed
    let err4 = map_network_error(&make_out("Host key verification failed."), "fail");
    assert!(err4.to_string().contains("SSH 主机指纹未确认"));

    // pull conflict
    let err5 = map_network_error(&make_out("CONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts"), "fail");
    assert!(err5.to_string().contains("拉取完成但产生冲突"));
}
