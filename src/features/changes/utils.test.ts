import { describe, expect, it } from "vitest";
import type { ChangeKind, StatusFile } from "./types";
import { getBadgeInfo, getCommitActionLabel, getDiscardConfirmOptions, getOperationBanner } from "./utils";

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
});

describe("getCommitActionLabel", () => {
  it("返回对应的按钮标题文案", () => {
    expect(getCommitActionLabel("commit")).toBe("提交");
    expect(getCommitActionLabel("amend")).toBe("提交（修改）");
    expect(getCommitActionLabel("commitAndPush")).toBe("提交和推送");
    expect(getCommitActionLabel("commitAndSync")).toBe("提交和同步");
  });
});
