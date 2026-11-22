import type { ConfirmOptions } from "@/components/ui/dialog";
import type { ChangeKind, RepoOperation, StatusFile } from "./types";

export type CommitAction = "commit" | "amend" | "commitAndPush" | "commitAndSync";

export interface BadgeInfo {
  letter: string;
  className: string;
  label: string;
}

export function getBadgeInfo(kind: ChangeKind): BadgeInfo {
  switch (kind) {
    case "modified":
      return { letter: "M", className: "text-st-modified bg-st-modified-bg", label: "已修改" };
    case "untracked":
      return { letter: "U", className: "text-st-untracked bg-st-untracked-bg", label: "未跟踪" };
    case "added":
      return { letter: "A", className: "text-st-added bg-st-added-bg", label: "已新增" };
    case "deleted":
      return { letter: "D", className: "text-st-deleted bg-st-deleted-bg", label: "已删除" };
    case "renamed":
      return { letter: "R", className: "text-st-renamed bg-st-renamed-bg", label: "已重命名" };
    case "copied":
      return { letter: "C", className: "text-st-renamed bg-st-renamed-bg", label: "已复制" };
    case "typeChanged":
      return { letter: "T", className: "text-st-modified bg-st-modified-bg", label: "类型变更" };
    case "conflicted":
      return { letter: "!", className: "text-st-conflict bg-st-conflict-bg", label: "冲突" };
  }
}

export function getOperationBanner(op: RepoOperation | null): string | null {
  switch (op) {
    case "merge":
      return "正在合并：解决冲突并暂存后提交";
    case "rebase":
      return "正在变基：解决冲突并暂存后继续";
    case "cherryPick":
      return "正在拣选（Cherry-pick）：解决冲突并暂存后提交";
    case "revert":
      return "正在还原（Revert）：解决冲突并暂存后提交";
    default:
      return null;
  }
}

export function getDiscardConfirmOptions(paths: string[], unstaged: StatusFile[]): ConfirmOptions {
  const count = paths.length;
  const untrackedSet = new Set(unstaged.filter((f) => f.kind === "untracked").map((f) => f.path));
  const hasUntracked = paths.some((p) => untrackedSet.has(p));

  const title = count === 1 ? "丢弃更改？" : `丢弃 ${count} 个文件的更改？`;
  let description: string;
  if (count === 1) {
    description = hasUntracked ? "将删除该未跟踪文件，无法撤销。" : "将丢弃此文件的修改，无法撤销。";
  } else {
    description = hasUntracked
      ? `将丢弃 ${count} 个文件的修改，包含的未跟踪文件会被删除，无法撤销。`
      : `将丢弃 ${count} 个文件的修改，无法撤销。`;
  }

  return {
    title,
    description,
    confirmText: "丢弃",
    danger: true,
  };
}

export function getCommitActionLabel(action: CommitAction): string {
  switch (action) {
    case "commit":
      return "提交";
    case "amend":
      return "提交（修改）";
    case "commitAndPush":
      return "提交和推送";
    case "commitAndSync":
      return "提交和同步";
  }
}
