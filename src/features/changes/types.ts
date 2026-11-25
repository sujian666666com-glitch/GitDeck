/** 与 `src-tauri/src/changes/types.rs` 对应 */

/** 徽标：M 修改、A 新增、D 删除、R 重命名、C 复制、T 类型变化、U 未跟踪、! 冲突 */
export type ChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "typeChanged"
  | "untracked"
  | "conflicted";

export interface StatusFile {
  /** 仓库内相对路径 */
  path: string;
  oldPath: string | null;
  kind: ChangeKind;
}

export type RepoOperation = "merge" | "rebase" | "cherryPick" | "revert";

export interface RepoStatus {
  /** 分离 HEAD 时为 null */
  branch: string | null;
  /** 空仓库为 null */
  headHash: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** 是否配置了任何远程仓库 */
  hasRemote: boolean;
  /** 无法按 UTF-8 解码的文件名计数 */
  unreadablePaths: number;
  staged: StatusFile[];
  /** 含未跟踪文件；部分暂存的文件同时出现在 staged 与 unstaged */
  unstaged: StatusFile[];
  conflicted: StatusFile[];
  operation: RepoOperation | null;
}

export interface CommitResult {
  hash: string;
  summary: string;
}
