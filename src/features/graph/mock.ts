import type { FileDiff } from "@/lib/diff";
import { mockError, type MockHandlers } from "@/mock/types";
import type { BranchFilter, CommitDetail, CommitPage, CommitQuery, CommitSummary, MergeResult, RefLabel, RepoRefs } from "./types";

const now = Math.floor(Date.now() / 1000);
const hash = (seed: string) => (seed + "0123456789abcdef".repeat(3)).slice(0, 40);

function commit(seed: string, parents: string[], subject: string, hoursAgo: number): CommitSummary {
  const full = hash(seed);
  return {
    hash: full,
    shortHash: full.slice(0, 7),
    parents: parents.map(hash),
    subject,
    authorName: "ik",
    authorEmail: "ik@example.com",
    authorTime: now - hoursAgo * 3600,
    refs: [],
  };
}

const olderSeed = (index: number) => `def${index.toString(16).padStart(4, "0")}`;
const olderCommits: CommitSummary[] = [];
for (let index = 0; index < 1_200; index++) {
  const parents = index < 1_199 ? [olderSeed(index + 1)] : [];
  if (index % 100 === 0) {
    const side = `fed${index.toString(16).padStart(4, "0")}`;
    olderCommits.push(commit(olderSeed(index), [...parents, side], "Merge maintenance", 100 + index));
    olderCommits.push(commit(side, parents, "fix: clean up stale sessions", 101 + index));
  } else {
    const subjects = ["fix: session timeout", "chore: update translations", "refactor: simplify token validation", "test: cover OAuth callback"];
    olderCommits.push(commit(olderSeed(index), parents, index === 1_199 ? "Initial commit" : subjects[index % subjects.length], 100 + index));
  }
}
const initialCommits: CommitSummary[] = [
  commit("a7", ["a6"], "feat: add login", 1),
  commit("a6", ["a5"], "fix: authentication", 3),
  commit("aa", ["a5"], "docs: update SSO setup", 4),
  commit("a5", ["a4"], "chore: update config", 5),
  commit("a4", ["a3", "b1"], "Merge develop", 8),
  commit("b1", ["a1"], "feat: OAuth support", 26),
  commit("a3", ["a1"], "fix: session refresh", 30),
  commit("a1", [olderSeed(0)], "feat: initial authentication API", 72),
  ...olderCommits,
];

const initialRefs: RepoRefs = {
  head: { branch: "ik/150-sso-login", hash: hash("a7"), detached: false },
  locals: [
    { name: "ik/150-sso-login", hash: hash("a7"), isCurrent: true, upstream: "origin/ik/150-sso-login", ahead: 1, behind: 0 },
    { name: "agentflow", hash: hash("a6"), isCurrent: false, upstream: "origin/agentflow", ahead: 0, behind: 0 },
    { name: "develop", hash: hash("b1"), isCurrent: false, upstream: "origin/develop", ahead: 0, behind: 0 },
  ],
  remotes: [
    { name: "origin/ik/150-sso-login", remote: "origin", hash: hash("a6") },
    { name: "origin/agentflow", remote: "origin", hash: hash("a6") },
    { name: "origin/develop", remote: "origin", hash: hash("b1") },
    { name: "origin/docs/sso", remote: "origin", hash: hash("aa") },
  ],
  tags: [{ name: "v0.1.0", hash: hash("a3") }, { name: "v0.2.0-rc.1", hash: hash("a6") }],
};

interface MockRepo {
  ordered: CommitSummary[];
  byHash: Map<string, CommitSummary>;
  refs: RepoRefs;
  merges: number;
}

const repositories = new Map<string, MockRepo>();
function repository(path: string): MockRepo {
  let repo = repositories.get(path);
  if (!repo) {
    repo = {
      ordered: [...initialCommits],
      byHash: new Map(initialCommits.map((item) => [item.hash, item])),
      refs: structuredClone(initialRefs),
      merges: 0,
    };
    repositories.set(path, repo);
  }
  return repo;
}

function resolve(repo: MockRepo, name: string): string {
  if (name === "HEAD" && repo.refs.head.hash) return repo.refs.head.hash;
  if (repo.byHash.has(name)) return name;
  const local = repo.refs.locals.find((ref) => ref.name === name || `refs/heads/${ref.name}` === name);
  const remote = repo.refs.remotes.find((ref) => ref.name === name || `refs/remotes/${ref.name}` === name);
  const tag = repo.refs.tags.find((ref) => ref.name === name || `refs/tags/${ref.name}` === name);
  return local?.hash ?? remote?.hash ?? tag?.hash ?? mockError("notFound", `找不到提交引用：${name}`);
}

function reachable(repo: MockRepo, tips: string[]): Set<string> {
  const hashes = new Set<string>();
  const pending = [...tips];
  while (pending.length > 0) {
    const hash = pending.pop()!;
    if (hashes.has(hash)) continue;
    hashes.add(hash);
    const commit = repo.byHash.get(hash);
    if (commit) pending.push(...commit.parents);
  }
  return hashes;
}

function tips(repo: MockRepo, filter: BranchFilter): string[] {
  if (filter.kind === "ref") return [resolve(repo, filter.ref)];
  const { head, locals, remotes, tags } = repo.refs;
  return [
    ...(filter.kind === "all" || filter.kind === "local" ? (head.hash ? [head.hash] : []).concat(locals.map((branch) => branch.hash)) : []),
    ...(filter.kind === "all" || filter.kind === "remote" ? remotes.map((branch) => branch.hash) : []),
    ...(filter.kind === "all" || filter.kind === "tags" ? tags.map((tag) => tag.hash) : []),
  ];
}

function labelled(repo: MockRepo, commit: CommitSummary): CommitSummary {
  const refs: RefLabel[] = [];
  for (const branch of repo.refs.locals) {
    if (branch.hash !== commit.hash) continue;
    const label = { name: branch.name, fullName: `refs/heads/${branch.name}`, kind: "local" as const, isCurrent: branch.isCurrent };
    if (branch.isCurrent) refs.unshift(label);
    else refs.push(label);
  }
  for (const branch of repo.refs.remotes) {
    if (branch.hash === commit.hash) refs.push({ name: branch.name, fullName: `refs/remotes/${branch.name}`, kind: "remote", isCurrent: false });
  }
  for (const tag of repo.refs.tags) {
    if (tag.hash === commit.hash) refs.push({ name: tag.name, fullName: `refs/tags/${tag.name}`, kind: "tag", isCurrent: false });
  }
  return { ...commit, refs };
}

function checkout(repo: MockRepo, name: string) {
  const branch = repo.refs.locals.find((branch) => branch.name === name) ?? mockError("notFound", "找不到该分支");
  repo.refs.head = { branch: name, hash: branch.hash, detached: false };
  for (const local of repo.refs.locals) local.isCurrent = local.name === name;
}

function create(repo: MockRepo, name: string, hash: string, upstream: string | null) {
  if (!name || name.startsWith("-") || /\s/.test(name)) mockError("invalid", "无效的分支名称");
  if (repo.refs.locals.some((branch) => branch.name === name)) mockError("git", "本地同名分支已存在");
  repo.refs.locals.push({ name, hash, isCurrent: false, upstream, ahead: 0, behind: 0 });
}

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
const ADDED_PATCH = `diff --git a/src/auth/sso.ts b/src/auth/sso.ts
new file mode 100644
--- /dev/null
+++ b/src/auth/sso.ts
@@ -0,0 +1,3 @@
+export const sso = {
+  authorize: (user: string) => requestToken(user),
+};
`;

export const graphMock: MockHandlers = {
  graph_commits: ({ repoPath, query }: { repoPath: string; query: CommitQuery }): CommitPage => {
    const repo = repository(repoPath);
    const hashes = reachable(repo, tips(repo, query.filter));
    const matching = repo.ordered.filter((commit) => hashes.has(commit.hash));
    return {
      commits: matching.slice(query.skip, query.skip + query.limit).map((commit) => labelled(repo, commit)),
      hasMore: query.skip + query.limit < matching.length,
    };
  },

  graph_refs: ({ repoPath }: { repoPath: string }): RepoRefs => structuredClone(repository(repoPath).refs),

  graph_commit_detail: ({ repoPath, hash }: { repoPath: string; hash: string }): CommitDetail => {
    const repo = repository(repoPath);
    const commit = repo.byHash.get(hash) ?? mockError("notFound", "找不到提交");
    return {
      ...labelled(repo, commit),
      body: commit.subject === "feat: add login" ? [
        "change-id: add-sso-login",
        "",
        "- 通过 `sso.authorize(user)` 发起单点登录",
        "- 登录成功后将令牌传给 `session.create`，建立用户会话",
      ].join("\n") : "",
      committerName: commit.authorName,
      committerEmail: commit.authorEmail,
      commitTime: commit.authorTime,
      files: [
        { path: "src/auth/login.ts", oldPath: null, kind: "modified", additions: 4, deletions: 2 },
        { path: "src/auth/sso.ts", oldPath: null, kind: "added", additions: 3, deletions: 0 },
        { path: "assets/logo.png", oldPath: null, kind: "modified", additions: null, deletions: null },
      ],
    };
  },

  graph_commit_file_diff: ({ path, oldPath }: { path: string; oldPath: string | null }): FileDiff => {
    const binary = path.endsWith(".png");
    return { path, oldPath, binary, truncated: false, patch: binary ? "" : path.endsWith("/sso.ts") ? ADDED_PATCH : SAMPLE_PATCH };
  },

  branch_checkout: ({ repoPath, name }: { repoPath: string; name: string }) => checkout(repository(repoPath), name),

  branch_checkout_remote: ({ repoPath, remoteBranch, localName }: { repoPath: string; remoteBranch: string; localName: string | null }) => {
    const repo = repository(repoPath);
    const short = remoteBranch.replace(/^refs\/remotes\//, "");
    const remote = repo.refs.remotes.find((branch) => branch.name === short) ?? mockError("notFound", "找不到远程分支");
    const name = localName || short.slice(short.indexOf("/") + 1);
    create(repo, name, remote.hash, remote.name);
    checkout(repo, name);
  },

  branch_create: ({ repoPath, name, startPoint, checkout: switchTo }: { repoPath: string; name: string; startPoint: string | null; checkout: boolean }) => {
    const repo = repository(repoPath);
    create(repo, name, resolve(repo, startPoint || "HEAD"), null);
    if (switchTo) checkout(repo, name);
  },

  branch_delete: ({ repoPath, name, force }: { repoPath: string; name: string; force: boolean }) => {
    const repo = repository(repoPath);
    const branch = repo.refs.locals.find((branch) => branch.name === name) ?? mockError("notFound", "找不到该分支");
    if (branch.isCurrent) mockError("git", "删除分支失败：分支正在被当前工作树使用");
    if (!force && !reachable(repo, [resolve(repo, branch.upstream ?? "HEAD")]).has(branch.hash)) {
      mockError("git", "删除分支失败：分支尚未合并");
    }
    repo.refs.locals = repo.refs.locals.filter((branch) => branch.name !== name);
  },

  branch_merge: ({ repoPath, name, noFf }: { repoPath: string; name: string; noFf: boolean }): MergeResult => {
    const repo = repository(repoPath);
    const branch = repo.refs.locals.find((branch) => branch.isCurrent) ?? mockError("git", "当前没有检出本地分支");
    const target = resolve(repo, name);
    if (reachable(repo, [branch.hash]).has(target)) return { outcome: "upToDate", message: "当前分支已包含这些提交" };
    if (!noFf && reachable(repo, [target]).has(branch.hash)) {
      repo.refs.head.hash = branch.hash = target;
      return { outcome: "fastForward", message: "已快进合并" };
    }
    const merge = commit(`cafe${(++repo.merges).toString(16).padStart(8, "0")}`, [branch.hash, target], `Merge ${name}`, 0);
    repo.ordered.unshift(merge);
    repo.byHash.set(merge.hash, merge);
    repo.refs.head.hash = branch.hash = merge.hash;
    return { outcome: "merged", message: "合并完成" };
  },
};
