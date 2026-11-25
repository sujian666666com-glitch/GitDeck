import { useRef, useState } from "react";
import { confirmDialog, promptDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { emitRepoChanged } from "@/lib/events";
import { toAppError } from "@/lib/tauri";
import { graphApi } from "./api";
import type { MergeOutcome, RefLabel } from "./types";

type BranchDialogRequest =
  | { kind: "create"; startPoint: string; from: string }
  | { kind: "merge"; branch: RefLabel; into: string };

const mergeMessages: Record<MergeOutcome, string> = {
  merged: "已合并",
  fastForward: "已快进合并",
  upToDate: "已是最新",
  conflicts: "合并产生冲突，请到 Changes 中解决",
};

export function useBranchActions(repoPath: string) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<BranchDialogRequest | null>(null);

  async function run(title: string, action: () => Promise<{ message: string; conflicts?: boolean } | null>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await action();
      if (!result) return;
      emitRepoChanged(repoPath, "all");
      if (result.conflicts) notify.info(result.message);
      else notify.success(result.message);
    } catch (error) {
      notify.error(error, title);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    dialog,
    closeDialog: () => setDialog(null),
    openCreate: (startPoint: string, from: string) => {
      if (!pending.current) setDialog({ kind: "create", startPoint, from });
    },
    createBranch: (startPoint: string, name: string, checkout: boolean) => {
      setDialog(null);
      return run("创建分支失败", async () => {
        await graphApi.createBranch(repoPath, name, startPoint, checkout);
        return { message: checkout ? `已创建并切换到 ${name}` : `已创建分支 ${name}` };
      });
    },
    checkout: (name: string) => run("切换分支失败", async () => {
      await graphApi.checkout(repoPath, name);
      return { message: `已切换到 ${name}` };
    }),
    checkoutRemote: (branch: RefLabel) => run("检出远程分支失败", async () => {
      const name = await promptDialog({
        title: "检出为本地分支",
        description: `新分支将跟踪 ${branch.name}。`,
        label: "本地分支名称",
        defaultValue: branch.name.slice(branch.name.indexOf("/") + 1),
        confirmText: "检出",
      });
      if (name === null) return null;
      await graphApi.checkoutRemote(repoPath, branch.fullName, name);
      return { message: `已检出并切换到 ${name}` };
    }),
    openMerge: (branch: RefLabel, into: string) => {
      if (!pending.current) setDialog({ kind: "merge", branch, into });
    },
    mergeBranch: (branch: RefLabel, noFf: boolean) => {
      setDialog(null);
      return run("合并分支失败", async () => {
        const { outcome } = await graphApi.merge(repoPath, branch.fullName, noFf);
        return { message: mergeMessages[outcome], conflicts: outcome === "conflicts" };
      });
    },
    remove: (name: string) => run("删除分支失败", async () => {
      const confirmed = await confirmDialog({ title: "删除本地分支？", description: `删除 ${name}。`, confirmText: "删除", danger: true });
      if (!confirmed) return null;
      try {
        await graphApi.deleteBranch(repoPath, name, false);
      } catch (error) {
        if (!toAppError(error).message.includes("分支尚未合并")) throw error;
        const force = await confirmDialog({
          title: "强制删除未合并的分支？",
          description: `${name} 包含尚未合并的提交。`,
          confirmText: "强制删除",
          danger: true,
        });
        if (!force) return null;
        await graphApi.deleteBranch(repoPath, name, true);
      }
      return { message: `已删除分支 ${name}` };
    }),
  };
}

export type BranchActions = ReturnType<typeof useBranchActions>;

export async function copyText(text: string | Promise<string>, label: string) {
  try {
    if (typeof text === "string" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      // Start the clipboard write in the menu gesture, even while Git loads the message.
      const data = Promise.resolve(text).then((value) => new Blob([value], { type: "text/plain" }));
      const write = navigator.clipboard.write([new ClipboardItem({ "text/plain": data })]);
      await Promise.all([write, data]);
    } else {
      const value = await text;
      const selection = document.activeElement;
      const field = document.createElement("textarea");
      field.value = value;
      field.className = "fixed top-0 left-0 size-px opacity-0";
      document.body.append(field);
      field.select();
      try {
        if (!document.execCommand("copy")) throw new Error("剪贴板不可用");
      } finally {
        field.remove();
        if (selection instanceof HTMLElement) selection.focus({ preventScroll: true });
      }
    }
    notify.success(`已复制${label}`);
  } catch (error) {
    notify.error(error, `复制${label}失败`);
  }
}
