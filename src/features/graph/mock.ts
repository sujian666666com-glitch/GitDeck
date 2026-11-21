import type { FileDiff } from "@/lib/diff";
import type { MockHandlers } from "@/mock/types";
import type { CommitDetail, CommitQuery, CommitSummary, RefLabel, RepoRefs } from "./types";

/** 浏览器预览数据：对照原型的提交历史（一条特性分支分叉后合并回主线） */
const now = Math.floor(Date.now() / 1000);
const hash = (seed: string) => (seed + "0123456789abcdef".repeat(3)).slice(0, 40);

const local = (name: string, isCurrent = false): RefLabel => ({ name, fullName: `refs/heads/${name}`, kind: "local", isCurrent });
const remote = (name: string): RefLabel => ({ name, fullName: `refs/remotes/${name}`, kind: "remote", isCurrent: false });
const tag = (name: string): RefLabel => ({ name, fullName: `refs/tags/${name}`, kind: "tag", isCurrent: false });

function commit(seed: string, parents: string[], subject: string, hoursAgo: number, refs: RefLabel[] = []): CommitSummary {
  const full = hash(seed);
  return {
    hash: full,
    shortHash: full.slice(0, 7),
    parents: parents.map(hash),
    subject,
    authorName: "ik",
    authorEmail: "ik@example.com",
    authorTime: now - hoursAgo * 3600,
    refs,
  };
}

const commits: CommitSummary[] = [
  commit("a7", ["a6"], "feat: add login", 1, [local("ik/150-sso-login", true), remote("origin/ik/150-sso-login")]),
  commit("a6", ["a5"], "fix: authentication", 3, [local("agentflow"), remote("origin/agentflow")]),
  commit("a5", ["a4"], "chore: update config", 5),
  commit("a4", ["a3", "b1"], "Merge develop", 8),
  commit("b1", ["a1"], "feat: OAuth support", 26, [local("develop"), remote("origin/develop")]),
  commit("a3", ["a1"], "fix: session refresh", 30, [tag("v0.1.0")]),
  commit("a1", [], "Initial commit", 72),
];

const refs: RepoRefs = {
  head: { branch: "ik/150-sso-login", hash: hash("a7"), detached: false },
  locals: [
    { name: "ik/150-sso-login", hash: hash("a7"), isCurrent: true, upstream: "origin/ik/150-sso-login", ahead: 0, behind: 0 },
    { name: "agentflow", hash: hash("a6"), isCurrent: false, upstream: "origin/agentflow", ahead: 0, behind: 0 },
    { name: "develop", hash: hash("b1"), isCurrent: false, upstream: "origin/develop", ahead: 0, behind: 0 },
  ],
  remotes: [
    { name: "origin/ik/150-sso-login", remote: "origin", hash: hash("a7") },
    { name: "origin/agentflow", remote: "origin", hash: hash("a6") },
    { name: "origin/develop", remote: "origin", hash: hash("b1") },
  ],
  tags: [{ name: "v0.1.0", hash: hash("a3") }],
};

const SAMPLE_PATCH = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index 3b18e51..a2c4f0d 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,6 +1,8 @@
 import { session } from "./session";
+import { sso } from "./sso";

-export function login(user: string) {
-  return session.create(user);
+export async function login(user: string) {
+  const token = await sso.authorize(user);
+  return session.create(user, token);
 }
`;

export const graphMock: MockHandlers = {
  graph_commits: ({ query }: { query: CommitQuery }) => {
    const page = commits.slice(query.skip, query.skip + query.limit);
    return { commits: page, hasMore: query.skip + query.limit < commits.length };
  },

  graph_refs: () => refs,

  graph_commit_detail: ({ hash: target }: { hash: string }): CommitDetail => {
    const summary = commits.find((c) => c.hash === target) ?? commits[0];
    return {
      ...summary,
      body: "补充单点登录流程，登录成功后写入会话。",
      committerName: summary.authorName,
      committerEmail: summary.authorEmail,
      commitTime: summary.authorTime,
      files: [
        { path: "src/auth/login.ts", oldPath: null, kind: "modified", additions: 3, deletions: 2 },
        { path: "src/auth/sso.ts", oldPath: null, kind: "added", additions: 42, deletions: 0 },
        { path: "assets/logo.png", oldPath: null, kind: "modified", additions: null, deletions: null },
      ],
    };
  },

  graph_commit_file_diff: ({ path }: { path: string }): FileDiff =>
    path.endsWith(".png")
      ? { path, oldPath: null, binary: true, truncated: false, patch: "" }
      : { path, oldPath: null, binary: false, truncated: false, patch: SAMPLE_PATCH },

  branch_checkout: () => null,
  branch_checkout_remote: () => null,
  branch_create: () => null,
  branch_delete: () => null,
  branch_merge: () => ({ outcome: "merged", message: "合并完成" }),
};
