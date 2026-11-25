import type { FileDiff } from "@/lib/diff";
import { call } from "@/lib/tauri";
import type { CommitResult, RepoStatus } from "./types";

/** Changes 与远程同步后端命令（`src-tauri/src/changes/commands.rs`） */
export const changesApi = {
  status: (repoPath: string) => call<RepoStatus>("changes_status", { repoPath }),
  fileDiff: (repoPath: string, path: string, staged: boolean) =>
    call<FileDiff>("changes_file_diff", { repoPath, path, staged }),
  stage: (repoPath: string, paths: string[]) => call<void>("changes_stage", { repoPath, paths }),
  unstage: (repoPath: string, paths: string[]) => call<void>("changes_unstage", { repoPath, paths }),
  discard: (repoPath: string, paths: string[]) => call<void>("changes_discard", { repoPath, paths }),
  commit: (repoPath: string, message: string, amend: boolean) =>
    call<CommitResult>("changes_commit", { repoPath, message, amend }),

  fetch: (repoPath: string) => call<void>("remote_fetch", { repoPath }),
  pull: (repoPath: string) => call<void>("remote_pull", { repoPath }),
  push: (repoPath: string) => call<void>("remote_push", { repoPath }),

  operationContinue: (repoPath: string) => call<void>("changes_operation_continue", { repoPath }),
  operationAbort: (repoPath: string) => call<void>("changes_operation_abort", { repoPath }),
};
