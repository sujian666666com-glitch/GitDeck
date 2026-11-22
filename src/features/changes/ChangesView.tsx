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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/menu";
import { confirmDialog } from "@/components/ui/dialog";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { CountBadge } from "@/components/ui/pill";
import { notify } from "@/components/ui/toast";
import { changesApi } from "@/features/changes/api";
import type { ChangeKind, RepoStatus, StatusFile } from "@/features/changes/types";
import {
  getBadgeInfo,
  getCommitActionLabel,
  getDiscardConfirmOptions,
  getOperationBanner,
  type CommitAction,
} from "@/features/changes/utils";
import { cn } from "@/lib/cn";
import type { FileDiff } from "@/lib/diff";
import { emitRepoChanged, useRepoChanged } from "@/lib/events";
import { splitPath } from "@/lib/format";
import { isMac, isModKey } from "@/lib/runtime";

export interface ChangesViewProps {
  /** 仓库根目录绝对路径 */
  repoPath: string;
  /** 当前是否为可见 Tab */
  active: boolean;
}

export function ChangesView({ repoPath, active }: ChangesViewProps) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [loading, setLoading] = useState(false);

  // Diff 展开状态（手风琴：同一时刻最多展开一个）
  const [expandedDiff, setExpandedDiff] = useState<{ path: string; staged: boolean } | null>(null);
  const [diffData, setDiffData] = useState<FileDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // 提交相关状态
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [selectedAction, setSelectedAction] = useState<CommitAction>("commit");

  // 加载仓库状态
  const loadStatus = useCallback(async () => {
    try {
      const res = await changesApi.status(repoPath);
      setStatus(res);
    } catch (err) {
      notify.error(err, "获取工作区状态失败");
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // 初次与活跃轮询（每 10 秒轻量刷新一次）
  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void loadStatus();
    const timer = setInterval(() => {
      void loadStatus();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadStatus, active]);

  // 监听仓库变更事件
  useRepoChanged(repoPath, (scope) => {
    if (scope === "worktree" || scope === "all") {
      void loadStatus();
    }
  });

  // 当文件列表变化时，校验并刷新当前展开的 Diff
  const expandedRef = useRef(expandedDiff);
  expandedRef.current = expandedDiff;
  useEffect(() => {
    if (!status || !expandedRef.current) return;
    const { path, staged } = expandedRef.current;
    const list = staged ? status.staged : status.unstaged;
    const exists = list.some((f) => f.path === path);
    if (!exists) {
      setExpandedDiff(null);
      setDiffData(null);
    } else {
      // 仍然存在时后台静默刷新 diff 内容
      changesApi
        .fileDiff(repoPath, path, staged)
        .then(setDiffData)
        .catch(() => {
          setExpandedDiff(null);
          setDiffData(null);
        });
    }
  }, [status, repoPath]);

  // 点击展开 / 收起 Diff
  const toggleDiff = async (path: string, staged: boolean) => {
    if (expandedDiff?.path === path && expandedDiff?.staged === staged) {
      setExpandedDiff(null);
      setDiffData(null);
      return;
    }
    setExpandedDiff({ path, staged });
    setDiffData(null);
    setLoadingDiff(true);
    try {
      const diff = await changesApi.fileDiff(repoPath, path, staged);
      setDiffData(diff);
    } catch (err) {
      notify.error(err, "加载文件差异失败");
      setExpandedDiff(null);
    } finally {
      setLoadingDiff(false);
    }
  };

  // 暂存操作
  const handleStage = async (paths: string[]) => {
    try {
      await changesApi.stage(repoPath, paths);
      emitRepoChanged(repoPath, "worktree");
      await loadStatus();
    } catch (err) {
      notify.error(err, "暂存失败");
    }
  };

  // 取消暂存
  const handleUnstage = async (paths: string[]) => {
    try {
      await changesApi.unstage(repoPath, paths);
      emitRepoChanged(repoPath, "worktree");
      await loadStatus();
    } catch (err) {
      notify.error(err, "取消暂存失败");
    }
  };

  // 丢弃修改
  const handleDiscard = async (paths: string[]) => {
    if (!status) return;
    const options = getDiscardConfirmOptions(paths, status.unstaged);
    if (await confirmDialog(options)) {
      try {
        await changesApi.discard(repoPath, paths);
        emitRepoChanged(repoPath, "worktree");
        await loadStatus();
      } catch (err) {
        notify.error(err, "丢弃更改失败");
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

  // 提交逻辑
  const executeCommit = async (action: CommitAction) => {
    if (committing) return;
    setCommitting(true);
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

      setCommitMsg("");
      emitRepoChanged(repoPath, "all");
      await loadStatus();
    } catch (err) {
      notify.error(err, "提交失败");
    } finally {
      setCommitting(false);
    }
  };

  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = status?.unstaged.length ?? 0;
  const conflictedCount = status?.conflicted.length ?? 0;
  const totalCount = stagedCount + unstagedCount + conflictedCount;

  // 提交按钮禁用判定
  const isSubmitDisabled =
    committing ||
    (selectedAction === "amend"
      ? !status?.headHash // 没有历史提交时无法 amend
      : totalCount === 0 || !commitMsg.trim());

  const operationBanner = getOperationBanner(status?.operation ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 进行中操作提示条 */}
      {operationBanner && (
        <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg bg-st-modified-bg px-3 py-2 text-[12px] font-medium text-st-modified">
          <AlertCircle className="size-4 shrink-0" />
          <span>{operationBanner}</span>
        </div>
      )}

      {/* 滚动变更列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">合并冲突</span>
                    <CountBadge>{conflictedCount}</CountBadge>
                  </div>
                  <div className="hidden items-center gap-1 group-hover:flex">
                    <IconButton
                      label="全部标记为已解决"
                      size="sm"
                      onClick={() => handleStage(status!.conflicted.map((f) => f.path))}
                    >
                      <Check />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-1 space-y-0.5">
                  {status!.conflicted.map((file) => (
                    <FileItemRow
                      key={`conflicted-${file.path}`}
                      file={file}
                      isStaged={false}
                      isExpanded={expandedDiff?.path === file.path && !expandedDiff.staged}
                      onToggleDiff={() => toggleDiff(file.path, false)}
                      onStage={() => handleStage([file.path])}
                      onCopyPath={() => handleCopyPath(file.path)}
                      loadingDiff={loadingDiff && expandedDiff?.path === file.path}
                      diffData={expandedDiff?.path === file.path && !expandedDiff.staged ? diffData : null}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 2. 暂存的更改区 */}
            {stagedCount > 0 && (
              <section>
                <div className="group flex h-8 items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">暂存的更改</span>
                    <CountBadge>{stagedCount}</CountBadge>
                  </div>
                  <div className="hidden items-center gap-1 group-hover:flex">
                    <IconButton
                      label="全部取消暂存"
                      size="sm"
                      onClick={() => handleUnstage(status!.staged.map((f) => f.path))}
                    >
                      <Minus />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-1 space-y-0.5">
                  {status!.staged.map((file) => (
                    <FileItemRow
                      key={`staged-${file.path}`}
                      file={file}
                      isStaged={true}
                      isExpanded={expandedDiff?.path === file.path && expandedDiff.staged}
                      onToggleDiff={() => toggleDiff(file.path, true)}
                      onUnstage={() => handleUnstage([file.path])}
                      onCopyPath={() => handleCopyPath(file.path)}
                      loadingDiff={loadingDiff && expandedDiff?.path === file.path}
                      diffData={expandedDiff?.path === file.path && expandedDiff.staged ? diffData : null}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 3. 更改区（未暂存） */}
            {(unstagedCount > 0 || (stagedCount === 0 && conflictedCount === 0)) && (
              <section>
                <div className="group flex h-8 items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">更改</span>
                    <CountBadge>{unstagedCount}</CountBadge>
                  </div>
                  {unstagedCount > 0 && (
                    <div className="hidden items-center gap-1 group-hover:flex">
                      <IconButton
                        label="全部丢弃"
                        size="sm"
                        onClick={() => handleDiscard(status!.unstaged.map((f) => f.path))}
                      >
                        <Undo2 />
                      </IconButton>
                      <IconButton
                        label="全部暂存"
                        size="sm"
                        onClick={() => handleStage(status!.unstaged.map((f) => f.path))}
                      >
                        <Plus />
                      </IconButton>
                    </div>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {status?.unstaged.map((file) => (
                    <FileItemRow
                      key={`unstaged-${file.path}`}
                      file={file}
                      isStaged={false}
                      isExpanded={expandedDiff?.path === file.path && !expandedDiff.staged}
                      onToggleDiff={() => toggleDiff(file.path, false)}
                      onStage={() => handleStage([file.path])}
                      onDiscard={() => handleDiscard([file.path])}
                      onCopyPath={() => handleCopyPath(file.path)}
                      loadingDiff={loadingDiff && expandedDiff?.path === file.path}
                      diffData={expandedDiff?.path === file.path && !expandedDiff.staged ? diffData : null}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* 底部固定提交区 */}
      <div className="shrink-0 border-t border-line bg-app pt-3 pb-1">
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (isModKey(e) && e.key === "Enter") {
              e.preventDefault();
              if (!isSubmitDisabled) {
                void executeCommit(selectedAction);
              }
            }
          }}
          placeholder="提交信息..."
          rows={3}
          className="w-full resize-none rounded-card border border-line-strong bg-surface p-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
        />

        <div className="mt-2 flex items-center gap-1.5">
          <Button
            size="lg"
            variant="primary"
            disabled={isSubmitDisabled}
            onClick={() => void executeCommit(selectedAction)}
            className="flex-1 font-medium"
          >
            {committing ? <Spinner className="text-white" /> : getCommitActionLabel(selectedAction)}
          </Button>

          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                disabled={committing}
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
                icon={<Check className={cn("size-4", selectedAction === "commit" ? "text-accent" : "opacity-0")} />}
                hint={isMac ? "⌘↵" : "Ctrl+↵"}
                onSelect={() => {
                  setSelectedAction("commit");
                  void executeCommit("commit");
                }}
              >
                提交
              </MenuItem>
              <MenuItem
                icon={<Check className={cn("size-4", selectedAction === "amend" ? "text-accent" : "opacity-0")} />}
                hint="amend"
                onSelect={() => {
                  setSelectedAction("amend");
                  void executeCommit("amend");
                }}
              >
                提交（修改）
              </MenuItem>
              <MenuItem
                icon={
                  <Check className={cn("size-4", selectedAction === "commitAndPush" ? "text-accent" : "opacity-0")} />
                }
                onSelect={() => {
                  setSelectedAction("commitAndPush");
                  void executeCommit("commitAndPush");
                }}
              >
                提交和推送
              </MenuItem>
              <MenuItem
                icon={
                  <Check className={cn("size-4", selectedAction === "commitAndSync" ? "text-accent" : "opacity-0")} />
                }
                onSelect={() => {
                  setSelectedAction("commitAndSync");
                  void executeCommit("commitAndSync");
                }}
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
  isStaged: boolean;
  isExpanded: boolean;
  onToggleDiff: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onCopyPath: () => void;
  loadingDiff?: boolean;
  diffData: FileDiff | null;
}

function FileItemRow({
  file,
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
            role="button"
            tabIndex={0}
            onClick={onToggleDiff}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleDiff();
              }
            }}
            className={cn(
              "group flex h-8 items-center gap-2 rounded-lg px-2 select-none transition-colors hover:bg-subtle cursor-pointer",
              isExpanded && "bg-subtle",
            )}
          >
            <FileCode2 className="size-4 shrink-0 text-muted" />

            <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
              <span className="truncate text-[13px] font-medium text-ink">{name}</span>
              {dir && <span className="truncate text-[12px] text-muted">{dir}</span>}
              {file.oldPath && <span className="truncate text-[11px] text-muted">← {file.oldPath}</span>}
            </div>

            {/* 行内悬停快捷操作 */}
            <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              {onDiscard && (
                <IconButton
                  label="丢弃更改"
                  size="sm"
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
            <ContextMenuItem icon={file.kind === "conflicted" ? <Check /> : <Plus />} onSelect={onStage}>
              {file.kind === "conflicted" ? "标记为已解决" : "暂存更改"}
            </ContextMenuItem>
          )}
          {onUnstage && (
            <ContextMenuItem icon={<Minus />} onSelect={onUnstage}>
              取消暂存
            </ContextMenuItem>
          )}
          {onDiscard && (
            <ContextMenuItem danger icon={<Undo2 />} onSelect={onDiscard}>
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
