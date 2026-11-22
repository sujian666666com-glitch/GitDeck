import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  FileCheck2,
  FileCode2,
  Minus,
  Plus,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { Button, IconButton } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/dialog";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/menu";
import { CountBadge } from "@/components/ui/pill";
import { notify } from "@/components/ui/toast";
import { Tip } from "@/components/ui/tooltip";
import { changesApi } from "@/features/changes/api";
import type { ChangeKind, RepoStatus, StatusFile } from "@/features/changes/types";
import {
  getBadgeInfo,
  getDiscardConfirmOptions,
  getOperationBanner,
  isCommitDisabled,
  type CommitAction,
} from "@/features/changes/utils";
import { cn } from "@/lib/cn";
import type { FileDiff } from "@/lib/diff";
import { emitRepoChanged, useRepoChanged } from "@/lib/events";
import { splitPath } from "@/lib/format";
import { isMac, isModKey } from "@/lib/runtime";
import { toAppError, type AppError } from "@/lib/tauri";

export interface ChangesViewProps {
  /** 仓库根目录绝对路径 */
  repoPath: string;
  /** 当前是否为可见 Tab */
  active: boolean;
}

export function ChangesView({ repoPath, active }: ChangesViewProps) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [statusError, setStatusError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(false);

  // 统一写操作互斥状态 (G7, S1)
  const [isOperating, setIsOperating] = useState(false);

  // Diff 展开状态（手风琴：同一时刻最多展开一个，记录所属分区 S2）
  const [expandedDiff, setExpandedDiff] = useState<{
    path: string;
    section: "staged" | "unstaged" | "conflicted";
  } | null>(null);
  const [diffData, setDiffData] = useState<FileDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const diffReqId = useRef(0);
  const lastDiffSigRef = useRef<string | null>(null);

  // 提交输入与当前仓库跨切换防护 (L7)
  const [commitMsg, setCommitMsg] = useState("");
  const repoPathRef = useRef(repoPath);
  repoPathRef.current = repoPath;

  // status 刷新递增序号 (G1)
  const statusReqId = useRef(0);

  const loadStatus = useCallback(async () => {
    const id = ++statusReqId.current;
    try {
      const res = await changesApi.status(repoPath);
      if (id === statusReqId.current) {
        setStatus(res);
        setStatusError(null);
      }
    } catch (err) {
      if (id === statusReqId.current) {
        const appErr = toAppError(err);
        setStatusError(appErr);
        // 如果之前已经有成功的 status，则保持界面数据并通过 toast 报警；否则由界面显示错误空态
        setStatus((prev) => {
          if (prev) {
            notify.error(err, "刷新工作区状态失败");
          }
          return prev;
        });
      }
    } finally {
      if (id === statusReqId.current) {
        setLoading(false);
      }
    }
  }, [repoPath]);

  // 初次加载与活跃轮询（每 10 秒轻量刷新一次）
  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void loadStatus();
    const timer = setInterval(() => {
      void loadStatus();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadStatus, active]);

  // 监听仓库变更事件（写操作后均通过事件驱动刷新 G1）
  useRepoChanged(repoPath, (scope) => {
    if (scope === "worktree" || scope === "all") {
      void loadStatus();
    }
  });

  // 当 status 变化时，根据分区与文件签名精准判断 Diff 刷新或关闭 (S2)
  const expandedRef = useRef(expandedDiff);
  expandedRef.current = expandedDiff;
  useEffect(() => {
    if (!status || !expandedRef.current) return;
    const { path, section } = expandedRef.current;
    const list =
      section === "staged"
        ? status.staged
        : section === "unstaged"
          ? status.unstaged
          : status.conflicted;
    const file = list.find((f) => f.path === path);
    if (!file) {
      diffReqId.current++;
      setExpandedDiff(null);
      setDiffData(null);
      lastDiffSigRef.current = null;
    } else {
      const currentSig = `${file.kind}:${file.oldPath ?? ""}`;
      if (currentSig !== lastDiffSigRef.current) {
        lastDiffSigRef.current = currentSig;
        const id = ++diffReqId.current;
        changesApi
          .fileDiff(repoPath, path, section === "staged")
          .then((d) => {
            if (id === diffReqId.current) setDiffData(d);
          })
          .catch(() => {
            if (id === diffReqId.current) {
              setExpandedDiff(null);
              setDiffData(null);
              lastDiffSigRef.current = null;
            }
          });
      }
    }
  }, [status, repoPath]);

  // 点击展开 / 收起 Diff（带自增序号防乱序错配 S2）
  const toggleDiff = async (path: string, section: "staged" | "unstaged" | "conflicted") => {
    if (expandedDiff?.path === path && expandedDiff?.section === section) {
      diffReqId.current++;
      setExpandedDiff(null);
      setDiffData(null);
      lastDiffSigRef.current = null;
      return;
    }
    const id = ++diffReqId.current;
    setExpandedDiff({ path, section });
    setDiffData(null);
    setLoadingDiff(true);
    try {
      const diff = await changesApi.fileDiff(repoPath, path, section === "staged");
      if (id === diffReqId.current) {
        setDiffData(diff);
        const list =
          section === "staged"
            ? status?.staged
            : section === "unstaged"
              ? status?.unstaged
              : status?.conflicted;
        const f = list?.find((item) => item.path === path);
        lastDiffSigRef.current = f ? `${f.kind}:${f.oldPath ?? ""}` : "";
      }
    } catch (err) {
      if (id === diffReqId.current) {
        notify.error(err, "加载文件差异失败");
        setExpandedDiff(null);
        lastDiffSigRef.current = null;
      }
    } finally {
      if (id === diffReqId.current) {
        setLoadingDiff(false);
      }
    }
  };

  // 暂存操作
  const handleStage = async (paths: string[]) => {
    if (isOperating) return;
    setIsOperating(true);
    try {
      await changesApi.stage(repoPath, paths);
    } catch (err) {
      notify.error(err, "暂存失败");
    } finally {
      setIsOperating(false);
      emitRepoChanged(repoPath, "worktree");
    }
  };

  // 取消暂存
  const handleUnstage = async (paths: string[]) => {
    if (isOperating) return;
    setIsOperating(true);
    try {
      await changesApi.unstage(repoPath, paths);
    } catch (err) {
      notify.error(err, "取消暂存失败");
    } finally {
      setIsOperating(false);
      emitRepoChanged(repoPath, "worktree");
    }
  };

  // 丢弃修改
  const handleDiscard = async (paths: string[]) => {
    if (isOperating || !status) return;
    const options = getDiscardConfirmOptions(paths, status.unstaged, status.staged);
    if (await confirmDialog(options)) {
      setIsOperating(true);
      try {
        await changesApi.discard(repoPath, paths);
      } catch (err) {
        notify.error(err, "丢弃更改失败");
      } finally {
        setIsOperating(false);
        emitRepoChanged(repoPath, "worktree");
      }
    }
  };

  // 复制路径
  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      notify.success("已复制路径");
    } catch (err) {
      notify.error(err, "复制路径失败");
    }
  };

  // 继续进行中的操作 (G5)
  const handleContinue = async () => {
    if (isOperating) return;
    setIsOperating(true);
    try {
      await changesApi.operationContinue(repoPath);
      notify.success("已成功继续当前操作");
    } catch (err) {
      notify.error(err, "继续操作失败");
    } finally {
      setIsOperating(false);
      emitRepoChanged(repoPath, "all");
    }
  };

  // 中止进行中的操作 (G5)
  const handleAbort = async () => {
    if (isOperating) return;
    const ok = await confirmDialog({
      danger: true,
      title: "中止当前操作？",
      description: "将放弃当前合并/变基并恢复到操作前状态，无法撤销。",
      confirmText: "中止",
    });
    if (!ok) return;

    setIsOperating(true);
    try {
      await changesApi.operationAbort(repoPath);
      notify.success("已成功中止操作并还原状态");
    } catch (err) {
      notify.error(err, "中止操作失败");
    } finally {
      setIsOperating(false);
      emitRepoChanged(repoPath, "all");
    }
  };

  // 提交动作入口 (S1, L7)
  const executeCommit = async (action: CommitAction) => {
    if (isCommitDisabled(status, commitMsg, isOperating, action)) return;

    // amend 检查是否已推送到远端 (S1)
    if (action === "amend" && status?.upstream && status.ahead === 0) {
      const ok = await confirmDialog({
        danger: true,
        title: "修改已推送的提交？",
        description: `该提交已推送到 ${status.upstream}，修改后需要强制推送才能同步，GitDeck 不提供强制推送。`,
        confirmText: "修改提交",
      });
      if (!ok) return;
    }

    const currentRepo = repoPath;
    setIsOperating(true);
    try {
      const isAmend = action === "amend";
      const res = await changesApi.commit(repoPath, commitMsg, isAmend);
      const shortHash = res.hash.slice(0, 7);

      if (action === "commitAndPush") {
        try {
          await changesApi.push(repoPath);
          notify.success(`已提交并推送：${shortHash}`, res.summary);
        } catch (pushErr) {
          notify.error(pushErr, `已提交（${shortHash}），但推送失败`);
        }
      } else if (action === "commitAndSync") {
        try {
          await changesApi.pull(repoPath);
          await changesApi.push(repoPath);
          notify.success(`已提交并同步：${shortHash}`, res.summary);
        } catch (syncErr) {
          notify.error(syncErr, `已提交（${shortHash}），但同步失败`);
        }
      } else {
        notify.success(isAmend ? `已修改提交：${shortHash}` : `已提交：${shortHash}`, res.summary);
      }

      // 如果当前仍在原仓库，清空提交信息
      if (repoPathRef.current === currentRepo) {
        setCommitMsg("");
      }
    } catch (err) {
      notify.error(err, "提交失败");
    } finally {
      setIsOperating(false);
      emitRepoChanged(currentRepo, "all");
    }
  };

  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = status?.unstaged.length ?? 0;
  const conflictedCount = status?.conflicted.length ?? 0;
  const totalCount = stagedCount + unstagedCount + conflictedCount;

  const operationBanner = getOperationBanner(status?.operation ?? null);

  // 虚拟滚动容器 (L5)
  const listContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: unstagedCount,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  // 首次读取失败错误状态 (G4)
  if (!status && statusError) {
    return (
      <div className="flex h-full min-h-0 flex-col justify-between">
        <EmptyState
          icon={<AlertCircle className="size-8 text-st-deleted" />}
          title="无法读取仓库状态"
          description={statusError.message}
          action={
            <Button variant="outline" size="sm" onClick={() => void loadStatus()}>
              重试
            </Button>
          }
          className="flex-1"
        />
        {/* 错误态下提交区禁用 */}
        <div className="shrink-0 border-t border-line bg-app pt-3 pb-1 opacity-60 pointer-events-none">
          <textarea
            disabled
            placeholder="提交信息..."
            rows={3}
            className="w-full resize-none rounded-card border border-line-strong bg-surface p-3 text-[13px] text-ink outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 无法识别 UTF-8 的路径警告 (G6) */}
      {status && status.unreadablePaths > 0 && (
        <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg bg-st-conflict-bg px-3 py-2 text-[12px] font-medium text-st-conflict">
          <AlertCircle className="size-4 shrink-0" />
          <span>有 {status.unreadablePaths} 个文件名无法识别，已跳过显示，请在终端处理</span>
        </div>
      )}

      {/* 进行中操作提示条 (G5) */}
      {operationBanner && (
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-lg bg-st-modified-bg px-3 py-2 text-[12px] font-medium text-st-modified">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="size-4 shrink-0" />
            <span className="truncate">{operationBanner}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 ml-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isOperating}
              onClick={handleContinue}
              className="h-6 px-2 text-[11px]"
            >
              继续
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isOperating}
              onClick={handleAbort}
              className="h-6 px-2 text-[11px] text-st-deleted hover:bg-st-deleted-bg"
            >
              中止
            </Button>
          </div>
        </div>
      )}

      {/* 滚动变更列表 */}
      <div ref={listContainerRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading && !status ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={<FileCheck2 className="size-8" />}
            title="没有需要提交的更改"
            description="工作区干净，所有修改均已提交。"
            className="py-16"
          />
        ) : (
          <div className="space-y-4 pb-4">
            {/* 1. 合并冲突区（置顶） */}
            {conflictedCount > 0 && (
              <section>
                <div className="group flex h-8 items-center justify-between px-2">
                  <span className="text-[14px] font-semibold text-ink">合并冲突</span>
                  <div className="flex items-center gap-1.5">
                    {/* 批量操作在徽标左侧，支持键盘 focus (L1, 9) */}
                    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1">
                      <IconButton
                        label="全部标记为已解决"
                        size="sm"
                        disabled={isOperating}
                        onClick={() => handleStage(status!.conflicted.map((f) => f.path))}
                      >
                        <Check />
                      </IconButton>
                    </div>
                    {/* 最右侧计数徽标 (9) */}
                    <CountBadge>{conflictedCount}</CountBadge>
                  </div>
                </div>
                <div className="mt-1 space-y-0.5">
                  {status!.conflicted.map((file) => (
                    <FileItemRow
                      key={`conflicted-${file.path}`}
                      file={file}
                      disabled={isOperating}
                      isExpanded={
                        expandedDiff?.path === file.path && expandedDiff.section === "conflicted"
                      }
                      onToggleDiff={() => toggleDiff(file.path, "conflicted")}
                      onStage={() => handleStage([file.path])}
                      onCopyPath={() => handleCopyPath(file.path)}
                      loadingDiff={loadingDiff && expandedDiff?.path === file.path}
                      diffData={
                        expandedDiff?.path === file.path && expandedDiff.section === "conflicted"
                          ? diffData
                          : null
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 2. 暂存的更改区 */}
            {stagedCount > 0 && (
              <section>
                <div className="group flex h-8 items-center justify-between px-2">
                  <span className="text-[14px] font-semibold text-ink">暂存的更改</span>
                  <div className="flex items-center gap-1.5">
                    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1">
                      <IconButton
                        label="全部取消暂存"
                        size="sm"
                        disabled={isOperating}
                        onClick={() => handleUnstage(status!.staged.map((f) => f.path))}
                      >
                        <Minus />
                      </IconButton>
                    </div>
                    <CountBadge>{stagedCount}</CountBadge>
                  </div>
                </div>
                <div className="mt-1 space-y-0.5">
                  {status!.staged.map((file) => (
                    <FileItemRow
                      key={`staged-${file.path}`}
                      file={file}
                      disabled={isOperating}
                      isExpanded={
                        expandedDiff?.path === file.path && expandedDiff.section === "staged"
                      }
                      onToggleDiff={() => toggleDiff(file.path, "staged")}
                      onUnstage={() => handleUnstage([file.path])}
                      onCopyPath={() => handleCopyPath(file.path)}
                      loadingDiff={loadingDiff && expandedDiff?.path === file.path}
                      diffData={
                        expandedDiff?.path === file.path && expandedDiff.section === "staged"
                          ? diffData
                          : null
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 3. 更改区（未暂存），只有冲突时隐藏 (L3) */}
            {(unstagedCount > 0 || (stagedCount === 0 && conflictedCount === 0)) && (
              <section>
                <div className="group flex h-8 items-center justify-between px-2">
                  <span className="text-[14px] font-semibold text-ink">更改</span>
                  <div className="flex items-center gap-1.5">
                    {unstagedCount > 0 && (
                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1">
                        <IconButton
                          label="全部丢弃"
                          size="sm"
                          disabled={isOperating}
                          onClick={() => handleDiscard(status!.unstaged.map((f) => f.path))}
                        >
                          <Undo2 />
                        </IconButton>
                        <IconButton
                          label="全部暂存"
                          size="sm"
                          disabled={isOperating}
                          onClick={() => handleStage(status!.unstaged.map((f) => f.path))}
                        >
                          <Plus />
                        </IconButton>
                      </div>
                    )}
                    <CountBadge>{unstagedCount}</CountBadge>
                  </div>
                </div>

                {/* 列表渲染：超过 200 项且未展开任何 Diff 时使用虚拟滚动 (L5) */}
                {unstagedCount > 200 && expandedDiff === null ? (
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const file = status!.unstaged[virtualRow.index];
                      return (
                        <div
                          key={`unstaged-v-${file.path}`}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <FileItemRow
                            file={file}
                            disabled={isOperating}
                            isExpanded={false}
                            onToggleDiff={() => toggleDiff(file.path, "unstaged")}
                            onStage={() => handleStage([file.path])}
                            onDiscard={() => handleDiscard([file.path])}
                            onCopyPath={() => handleCopyPath(file.path)}
                            loadingDiff={false}
                            diffData={null}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {status?.unstaged.map((file) => (
                      <FileItemRow
                        key={`unstaged-${file.path}`}
                        file={file}
                        disabled={isOperating}
                        isExpanded={
                          expandedDiff?.path === file.path && expandedDiff.section === "unstaged"
                        }
                        onToggleDiff={() => toggleDiff(file.path, "unstaged")}
                        onStage={() => handleStage([file.path])}
                        onDiscard={() => handleDiscard([file.path])}
                        onCopyPath={() => handleCopyPath(file.path)}
                        loadingDiff={loadingDiff && expandedDiff?.path === file.path}
                        diffData={
                          expandedDiff?.path === file.path && expandedDiff.section === "unstaged"
                            ? diffData
                            : null
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {/* 底部固定提交区 */}
      <div className="shrink-0 border-t border-line bg-app pt-3 pb-1">
        <textarea
          value={commitMsg}
          disabled={isOperating || status?.operation === "rebase"}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (isModKey(e) && e.key === "Enter") {
              e.preventDefault();
              void executeCommit("commit");
            }
          }}
          placeholder={
            status?.operation === "rebase"
              ? "正在变基，请在上方使用「继续」完成变基..."
              : "提交信息..."
          }
          rows={3}
          className="w-full resize-none rounded-card border border-line-strong bg-surface p-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent disabled:opacity-50"
        />

        <div className="mt-2 flex items-center gap-1.5">
          {/* 主按钮固定为「提交」，悬停提示智能提交说明 (S1, L14) */}
          <Tip
            content={
              status?.operation === "rebase"
                ? "正在变基，请使用「继续」完成变基"
                : status?.staged.length === 0 && (status?.unstaged.length ?? 0) > 0
                  ? "暂存区为空，将自动暂存全部更改并提交"
                  : ""
            }
          >
            <span className="flex-1">
              <Button
                size="lg"
                variant="primary"
                disabled={isCommitDisabled(status, commitMsg, isOperating, "commit")}
                onClick={() => void executeCommit("commit")}
                className="w-full font-medium"
              >
                {isOperating ? <Spinner className="text-white" /> : "提交"}
              </Button>
            </span>
          </Tip>

          {/* 独立下拉菜单：点击立即执行相应动作并严格校验 (S1) */}
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                disabled={isOperating || status?.operation === "rebase"}
                aria-label="更多提交选项"
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-card border border-line-strong bg-surface text-ink transition-colors",
                  "hover:bg-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus/60 disabled:cursor-not-allowed disabled:text-faint",
                )}
              >
                <ChevronDown className="size-4 text-muted" />
              </button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                disabled={isCommitDisabled(status, commitMsg, isOperating, "commit")}
                hint={isMac ? "⌘↵" : "Ctrl+↵"}
                onSelect={() => void executeCommit("commit")}
              >
                提交
              </MenuItem>
              <MenuItem
                disabled={isCommitDisabled(status, commitMsg, isOperating, "amend")}
                hint="amend"
                onSelect={() => void executeCommit("amend")}
              >
                提交（修改）
              </MenuItem>
              <MenuItem
                disabled={isCommitDisabled(status, commitMsg, isOperating, "commitAndPush")}
                onSelect={() => void executeCommit("commitAndPush")}
              >
                提交和推送
              </MenuItem>
              <MenuItem
                disabled={isCommitDisabled(status, commitMsg, isOperating, "commitAndSync")}
                onSelect={() => void executeCommit("commitAndSync")}
              >
                提交和同步
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
    </div>
  );
}

interface FileItemRowProps {
  file: StatusFile;
  disabled: boolean;
  isExpanded: boolean;
  onToggleDiff: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onCopyPath: () => void;
  loadingDiff?: boolean;
  diffData: FileDiff | null;
}

/**
 * 文件行组件：彻底解构嵌套按钮，左侧主区域为 button，右侧快捷按钮与之平级 (L2)
 */
function FileItemRow({
  file,
  disabled,
  isExpanded,
  onToggleDiff,
  onStage,
  onUnstage,
  onDiscard,
  onCopyPath,
  loadingDiff,
  diffData,
}: FileItemRowProps) {
  const { dir, name } = splitPath(file.path);

  return (
    <div className="flex flex-col">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group flex h-8 items-center gap-2 rounded-lg px-2 select-none transition-colors hover:bg-subtle",
              isExpanded && "bg-subtle",
            )}
          >
            {/* 点击展开 Diff 的主按钮 (L2) */}
            <button
              type="button"
              onClick={onToggleDiff}
              className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none cursor-pointer"
            >
              <FileCode2 className="size-4 shrink-0 text-muted" />
              <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
                <span className="truncate text-[13px] font-medium text-ink">{name}</span>
                {dir && <span className="truncate text-[12px] text-muted">{dir}</span>}
                {file.oldPath && <span className="truncate text-[11px] text-muted">← {file.oldPath}</span>}
              </div>
            </button>

            {/* 行内悬停快捷操作（与主 button 平级，键盘 focus 时可达） */}
            <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex shrink-0 items-center gap-0.5">
              {onDiscard && (
                <IconButton
                  label="丢弃更改"
                  size="sm"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscard();
                  }}
                >
                  <Undo2 />
                </IconButton>
              )}
              {onStage && (
                <IconButton
                  label={file.kind === "conflicted" ? "标记为已解决" : "暂存更改"}
                  size="sm"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStage();
                  }}
                >
                  {file.kind === "conflicted" ? <Check /> : <Plus />}
                </IconButton>
              )}
              {onUnstage && (
                <IconButton
                  label="取消暂存"
                  size="sm"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstage();
                  }}
                >
                  <Minus />
                </IconButton>
              )}
            </div>

            {/* 状态徽标 */}
            <StatusBadge kind={file.kind} />
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          {onStage && (
            <ContextMenuItem
              disabled={disabled}
              icon={file.kind === "conflicted" ? <Check /> : <Plus />}
              onSelect={onStage}
            >
              {file.kind === "conflicted" ? "标记为已解决" : "暂存更改"}
            </ContextMenuItem>
          )}
          {onUnstage && (
            <ContextMenuItem disabled={disabled} icon={<Minus />} onSelect={onUnstage}>
              取消暂存
            </ContextMenuItem>
          )}
          {onDiscard && (
            <ContextMenuItem danger disabled={disabled} icon={<Undo2 />} onSelect={onDiscard}>
              丢弃更改
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem icon={<Copy />} onSelect={onCopyPath}>
            复制相对路径
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* 手风琴展开的 Diff 区域 */}
      {isExpanded && (
        <div className="my-1.5 overflow-hidden rounded-lg border border-line bg-surface">
          {loadingDiff ? (
            <div className="flex h-24 items-center justify-center">
              <Spinner />
            </div>
          ) : diffData ? (
            <DiffViewer diff={diffData} className="max-h-[50vh]" />
          ) : null}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ kind }: { kind: ChangeKind }) {
  const info = getBadgeInfo(kind);
  return (
    <span
      title={info.label}
      className={cn(
        "inline-flex size-5 shrink-0 select-none items-center justify-center rounded text-[11px] font-semibold tabular-nums",
        info.className,
      )}
    >
      {info.letter}
    </span>
  );
}
