/** 与 `src-tauri/src/graph/types.rs` 对应 */

/** 颜色只区分分支；类型靠图标区分：本地分支（分支图标）、远程（云朵）、Tag（标签） */
export type RefKind = "head" | "local" | "remote" | "tag";

export interface RefLabel {
  /** 短名：main、origin/main、v1.0.0 */
  name: string;
  /** refs/heads/main */
  fullName: string;
  kind: RefKind;
  isCurrent: boolean;
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  /** 第一个为主父提交 */
  parents: string[];
  subject: string;
  authorName: string;
  authorEmail: string;
  /** Unix 秒 */
  authorTime: number;
  refs: RefLabel[];
}

export type BranchFilter =
  | { kind: "all" }
  | { kind: "local" }
  | { kind: "remote" }
  | { kind: "tags" }
  | { kind: "ref"; ref: string };

export interface CommitQuery {
  filter: BranchFilter;
  skip: number;
  limit: number;
}

export interface CommitPage {
  /** 拓扑序，新在前 */
  commits: CommitSummary[];
  hasMore: boolean;
}

export interface HeadInfo {
  branch: string | null;
  hash: string | null;
  detached: boolean;
}

export interface LocalBranch {
  name: string;
  hash: string;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface RemoteBranch {
  name: string;
  remote: string;
  hash: string;
}

export interface TagRef {
  name: string;
  hash: string;
}

export interface RepoRefs {
  head: HeadInfo;
  locals: LocalBranch[];
  remotes: RemoteBranch[];
  tags: TagRef[];
}

export type FileChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "typeChanged"
  | "unmerged"
  | "unknown";

export interface CommitFile {
  path: string;
  oldPath: string | null;
  kind: FileChangeKind;
  additions: number | null;
  deletions: number | null;
}

export interface CommitDetail extends CommitSummary {
  body: string;
  committerName: string;
  committerEmail: string;
  commitTime: number;
  files: CommitFile[];
}

export type MergeOutcome = "merged" | "fastForward" | "upToDate" | "conflicts";

export interface MergeResult {
  outcome: MergeOutcome;
  message: string;
}
