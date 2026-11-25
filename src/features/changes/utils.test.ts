import { describe, expect, it } from "vitest";
import type { ChangeKind, RepoStatus, StatusFile } from "./types";
import {
  getBadgeInfo,
  getCommitActionLabel,
  getDiscardConfirmOptions,
  getOperationBanner,
  isCommitDisabled,
  SeqTracker,
} from "./utils";

describe("getBadgeInfo", () => {
  it("正确映射所有变更类型的字母和样式", () => {
    const kinds: ChangeKind[] = [
      "modified",
      "untracked",
      "added",
      "deleted",
      "renamed",
      "copied",
      "typeChanged",
      "conflicted",
    ];
    const letters = kinds.map((k) => getBadgeInfo(k).letter);
    expect(letters).toEqual(["M", "U", "A", "D", "R", "C", "T", "!"]);

    expect(getBadgeInfo("modified").className).toContain("text-st-modified");
    expect(getBadgeInfo("untracked").className).toContain("text-st-untracked");
    expect(getBadgeInfo("added").className).toContain("text-st-added");
    expect(getBadgeInfo("deleted").className).toContain("text-st-deleted");
    expect(getBadgeInfo("renamed").className).toContain("text-st-renamed");
    expect(getBadgeInfo("conflicted").className).toContain("text-st-conflict");
  });
});

describe("getOperationBanner", () => {
  it("针对不同正在进行的操作返回清晰中文提示", () => {
    expect(getOperationBanner("merge")).toBe("正在合并：解决冲突并暂存后提交");
    expect(getOperationBanner("rebase")).toBe("正在变基：解决冲突并暂存后继续");
    expect(getOperationBanner("cherryPick")).toBe("正在拣选（Cherry-pick）：解决冲突并暂存后提交");
    expect(getOperationBanner("revert")).toBe("正在还原（Revert）：解决冲突并暂存后提交");
    expect(getOperationBanner(null)).toBeNull();
  });
});

describe("getDiscardConfirmOptions", () => {
  const unstaged: StatusFile[] = [
    { path: "src/a.ts", oldPath: null, kind: "modified" },
    { path: "src/b.ts", oldPath: null, kind: "untracked" },
  ];

  it("单已跟踪文件丢弃提示", () => {
    const opt = getDiscardConfirmOptions(["src/a.ts"], unstaged);
    expect(opt.title).toBe("丢弃更改？");
    expect(opt.description).toBe("将丢弃此文件的修改，无法撤销。");
    expect(opt.danger).toBe(true);
  });

  it("单未跟踪文件丢弃提示说明会被删除", () => {
    const opt = getDiscardConfirmOptions(["src/b.ts"], unstaged);
    expect(opt.title).toBe("丢弃更改？");
    expect(opt.description).toBe("将删除该未跟踪文件，无法撤销。");
    expect(opt.danger).toBe(true);
  });

  it("批量丢弃包含未跟踪文件时说明未跟踪文件会被删除", () => {
    const opt = getDiscardConfirmOptions(["src/a.ts", "src/b.ts"], unstaged);
    expect(opt.title).toBe("丢弃 2 个文件的更改？");
    expect(opt.description).toContain("包含的未跟踪文件会被删除");
    expect(opt.danger).toBe(true);
  });

  it("部分暂存文件丢弃时提示说明暂存区内容会保留", () => {
    const staged: StatusFile[] = [{ path: "src/a.ts", oldPath: null, kind: "modified" }];
    const opt = getDiscardConfirmOptions(["src/a.ts"], unstaged, staged);
    expect(opt.description).toContain("暂存区中的内容会保留。");
  });
});

describe("getCommitActionLabel", () => {
  it("返回对应的按钮标题文案", () => {
    expect(getCommitActionLabel("commit")).toBe("提交");
    expect(getCommitActionLabel("amend")).toBe("提交（修改）");
    expect(getCommitActionLabel("commitAndPush")).toBe("提交和推送");
    expect(getCommitActionLabel("commitAndSync")).toBe("提交和同步");
  });
});

describe("isCommitDisabled 真值表", () => {
  const baseStatus: RepoStatus = {
    branch: "main",
    headHash: "abc1234567890",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    hasRemote: true,
    unreadablePaths: 0,
    staged: [{ path: "src/a.ts", oldPath: null, kind: "modified" }],
    unstaged: [],
    conflicted: [],
    operation: null,
  };

  it("常规提交：有消息且有变更时不禁用", () => {
    expect(isCommitDisabled(baseStatus, "feat: valid", false, "commit")).toBe(false);
  });

  it("常规提交：消息为空时禁用", () => {
    expect(isCommitDisabled(baseStatus, "   ", false, "commit")).toBe(true);
  });

  it("常规提交：无变更时禁用", () => {
    const emptyStatus: RepoStatus = { ...baseStatus, staged: [], unstaged: [] };
    expect(isCommitDisabled(emptyStatus, "feat: valid", false, "commit")).toBe(true);
  });

  it("正在操作中（isOperating）一律禁用", () => {
    expect(isCommitDisabled(baseStatus, "feat: valid", true, "commit")).toBe(true);
  });

  it("变基过程中禁用所有常规提交和 amend", () => {
    const rebaseStatus: RepoStatus = { ...baseStatus, operation: "rebase" };
    expect(isCommitDisabled(rebaseStatus, "feat: valid", false, "commit")).toBe(true);
    expect(isCommitDisabled(rebaseStatus, "", false, "amend")).toBe(true);
  });

  it("amend：允许空消息，只要有历史提交即可", () => {
    expect(isCommitDisabled(baseStatus, "", false, "amend")).toBe(false);
  });

  it("amend：空仓库无历史提交时禁用", () => {
    const initialStatus: RepoStatus = { ...baseStatus, headHash: null };
    expect(isCommitDisabled(initialStatus, "", false, "amend")).toBe(true);
  });

  it("amend：合并进行中禁用", () => {
    const mergeStatus: RepoStatus = { ...baseStatus, operation: "merge" };
    expect(isCommitDisabled(mergeStatus, "", false, "amend")).toBe(true);
  });

  it("status 为 null 时禁用", () => {
    expect(isCommitDisabled(null, "feat: test", false, "commit")).toBe(true);
  });
});

describe("SeqTracker 异步响应序号管理", () => {
  it("能够正确判断最新请求并拦截迟到响应", () => {
    const tracker = new SeqTracker();
    const req1 = tracker.next();
    const req2 = tracker.next();

    expect(tracker.isLatest(req1)).toBe(false);
    expect(tracker.isLatest(req2)).toBe(true);

    tracker.invalidate();
    expect(tracker.isLatest(req2)).toBe(false);
  });
});
