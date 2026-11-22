import type { FileDiff } from "@/lib/diff";
import { mockError, type MockHandlers } from "@/mock/types";
import type { RepoStatus, StatusFile } from "./types";

/** 浏览器预览数据：对照原型的 login.ts (M)、auth.ts (M)、config.json (U) */
let staged: StatusFile[] = [];
let unstaged: StatusFile[] = [
  { path: "src/login.ts", oldPath: null, kind: "modified" },
  { path: "src/auth.ts", oldPath: null, kind: "modified" },
  { path: "config.json", oldPath: null, kind: "untracked" },
];
let ahead = 1;
let behind = 0;
let headSeq = 0;

function status(): RepoStatus {
  return {
    branch: "ik/150-sso-login",
    headHash: `f00d${String(headSeq).padStart(36, "0")}`,
    upstream: "origin/ik/150-sso-login",
    ahead,
    behind,
    hasRemote: true,
    unreadablePaths: 0,
    staged: structuredClone(staged),
    unstaged: structuredClone(unstaged),
    conflicted: [],
    operation: null,
  };
}

const MODIFIED_PATCH = (path: string) => `diff --git a/${path} b/${path}
index 3b18e51..a2c4f0d 100644
--- a/${path}
+++ b/${path}
@@ -1,5 +1,6 @@
 import { session } from "./session";

-export function login(user: string) {
+export async function login(user: string) {
+  await session.refresh();
   return session.create(user);
 }
`;

const NEW_FILE_PATCH = (path: string) => `diff --git a/${path} b/${path}
new file mode 100644
--- /dev/null
+++ b/${path}
@@ -0,0 +1,4 @@
+{
+  "sso": true,
+  "timeout": 30
+}
`;

export const changesMock: MockHandlers = {
  changes_status: () => status(),

  changes_file_diff: ({ path, staged: fromIndex }: { path: string; staged: boolean }): FileDiff => {
    const list = fromIndex ? staged : unstaged;
    const file = list.find((f) => f.path === path) ?? mockError("notFound", "文件已不在变更列表中");
    const isNew = file.kind === "untracked" || file.kind === "added";
    return { path, oldPath: null, binary: false, truncated: false, patch: isNew ? NEW_FILE_PATCH(path) : MODIFIED_PATCH(path) };
  },

  changes_stage: ({ paths }: { paths: string[] }) => {
    const moving = unstaged.filter((f) => paths.includes(f.path));
    unstaged = unstaged.filter((f) => !paths.includes(f.path));
    for (const file of moving) {
      staged = staged.filter((f) => f.path !== file.path);
      staged.push({ ...file, kind: file.kind === "untracked" ? "added" : file.kind });
    }
    return null;
  },

  changes_unstage: ({ paths }: { paths: string[] }) => {
    const moving = staged.filter((f) => paths.includes(f.path));
    staged = staged.filter((f) => !paths.includes(f.path));
    for (const file of moving) {
      unstaged = unstaged.filter((f) => f.path !== file.path);
      unstaged.push({ ...file, kind: file.kind === "added" ? "untracked" : file.kind });
    }
    return null;
  },

  changes_discard: ({ paths }: { paths: string[] }) => {
    unstaged = unstaged.filter((f) => !paths.includes(f.path));
    return null;
  },

  changes_commit: ({ message, amend }: { message: string; amend: boolean }) => {
    if (!message.trim() && !amend) mockError("invalid", "提交信息不能为空");
    if (amend && headSeq === 0 && !status().headHash) {
      mockError("invalid", "当前仓库尚无提交，无法修改提交");
    }
    if (staged.length === 0 && !amend) {
      if (unstaged.length === 0) mockError("invalid", "没有可提交的更改");
      staged = unstaged.map((f) => ({ ...f, kind: f.kind === "untracked" ? "added" : f.kind }));
      unstaged = [];
    }
    staged = [];
    headSeq += 1;
    if (!amend) ahead += 1;
    return { hash: status().headHash!, summary: message.split("\n")[0] || "amended commit" };
  },

  remote_fetch: () => null,
  remote_pull: () => {
    behind = 0;
    return null;
  },
  remote_push: () => {
    ahead = 0;
    return null;
  },

  changes_operation_continue: () => null,
  changes_operation_abort: () => null,
};
