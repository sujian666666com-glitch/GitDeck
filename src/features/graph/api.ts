import type { FileDiff } from "@/lib/diff";
import { call } from "@/lib/tauri";
import type { CommitDetail, CommitPage, CommitQuery, MergeResult, RepoRefs } from "./types";

/** Git Graph 后端命令（`src-tauri/src/graph/commands.rs`） */
export const graphApi = {
  commits: (repoPath: string, query: CommitQuery) => call<CommitPage>("graph_commits", { repoPath, query }),
  refs: (repoPath: string) => call<RepoRefs>("graph_refs", { repoPath }),
  commitDetail: (repoPath: string, hash: string) => call<CommitDetail>("graph_commit_detail", { repoPath, hash }),
  commitFileDiff: (repoPath: string, hash: string, path: string, oldPath: string | null) =>
    call<FileDiff>("graph_commit_file_diff", { repoPath, hash, path, oldPath }),

  checkout: (repoPath: string, name: string) => call<void>("branch_checkout", { repoPath, name }),
  checkoutRemote: (repoPath: string, remoteBranch: string, localName: string | null) =>
    call<void>("branch_checkout_remote", { repoPath, remoteBranch, localName }),
  createBranch: (repoPath: string, name: string, startPoint: string | null, checkout: boolean) =>
    call<void>("branch_create", { repoPath, name, startPoint, checkout }),
  deleteBranch: (repoPath: string, name: string, force: boolean) =>
    call<void>("branch_delete", { repoPath, name, force }),
  merge: (repoPath: string, name: string, noFf: boolean) => call<MergeResult>("branch_merge", { repoPath, name, noFf }),
};
