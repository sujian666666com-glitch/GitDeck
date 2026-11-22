import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { Tip } from "@/components/ui/tooltip";
import { changesApi } from "@/features/changes/api";
import type { RepoStatus } from "@/features/changes/types";
import { emitRepoChanged, useRepoChanged } from "@/lib/events";

export interface SyncActionsProps {
  repoPath: string;
}

/**
 * 仓库头部右侧的远程同步入口（Fetch / Pull / Push 与 ahead/behind），Graph 与 Changes 两个视图共用。
 */
export function SyncActions({ repoPath }: SyncActionsProps) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [syncing, setSyncing] = useState<"fetch" | "pull" | "push" | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await changesApi.status(repoPath);
      setStatus(res);
    } catch {
      // 后端或仓库暂时不可用时忽略，由主视图呈现错误
    }
  }, [repoPath]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useRepoChanged(repoPath, () => {
    void refreshStatus();
  });

  const handleFetch = async () => {
    if (syncing) return;
    setSyncing("fetch");
    try {
      await changesApi.fetch(repoPath);
      notify.success("已获取远程更新");
      emitRepoChanged(repoPath, "all");
      await refreshStatus();
    } catch (err) {
      notify.error(err, "获取失败");
    } finally {
      setSyncing(null);
    }
  };

  const handlePull = async () => {
    if (syncing) return;
    setSyncing("pull");
    try {
      await changesApi.pull(repoPath);
      notify.success("已拉取最新更改");
      emitRepoChanged(repoPath, "all");
      await refreshStatus();
    } catch (err) {
      notify.error(err, "拉取失败");
    } finally {
      setSyncing(null);
    }
  };

  const handlePush = async () => {
    if (syncing) return;
    setSyncing("push");
    try {
      await changesApi.push(repoPath);
      notify.success(status?.upstream ? "推送成功" : "已发布分支并推送到远程");
      emitRepoChanged(repoPath, "all");
      await refreshStatus();
    } catch (err) {
      notify.error(err, "推送失败");
    } finally {
      setSyncing(null);
    }
  };

  const hasRemote = status?.hasRemote ?? false;
  const hasUpstream = Boolean(status?.upstream);
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const hasAheadBehind = ahead > 0 || behind > 0;

  const fetchTip = !hasRemote ? "未配置远程仓库" : "获取（Fetch）";
  const pullTip = !hasRemote ? "未配置远程仓库" : !hasUpstream ? "当前分支未设置上游分支" : "拉取（Pull）";
  const pushTip = !hasRemote ? "未配置远程仓库" : !hasUpstream ? "发布分支到远程仓库" : "推送（Push）";

  return (
    <div className="flex items-center gap-1">
      {hasAheadBehind && (
        <span
          className="mr-1 select-none font-mono text-[11px] font-medium text-muted tabular-nums"
          title={`落后 ${behind} 个提交，领先 ${ahead} 个提交`}
        >
          {behind > 0 && `↓${behind}`}
          {behind > 0 && ahead > 0 && " "}
          {ahead > 0 && `↑${ahead}`}
        </span>
      )}

      <Tip content={fetchTip}>
        <span>
          <IconButton
            label={fetchTip}
            noTip
            size="md"
            disabled={!hasRemote || syncing !== null}
            onClick={handleFetch}
          >
            <RefreshCw className={syncing === "fetch" ? "animate-spin" : ""} />
          </IconButton>
        </span>
      </Tip>

      <Tip content={pullTip}>
        <span>
          <IconButton
            label={pullTip}
            noTip
            size="md"
            disabled={!hasRemote || !hasUpstream || syncing !== null}
            onClick={handlePull}
          >
            <ArrowDownToLine className={syncing === "pull" ? "animate-bounce" : ""} />
          </IconButton>
        </span>
      </Tip>

      <Tip content={pushTip}>
        <span>
          <IconButton
            label={pushTip}
            noTip
            size="md"
            disabled={!hasRemote || syncing !== null}
            onClick={handlePush}
          >
            <ArrowUpFromLine className={syncing === "push" ? "animate-bounce" : ""} />
          </IconButton>
        </span>
      </Tip>
    </div>
  );
}
