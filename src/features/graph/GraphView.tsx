import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, CircleAlert, Cloud, Copy, Filter, GitBranch, GitGraph, Plus, RefreshCw, Tag } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
  Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger,
} from "@/components/ui/menu";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import { graphApi } from "./api";
import { copyText, useBranchActions, type BranchActions } from "./branchActions";
import { CreateBranchDialog, MergeBranchDialog } from "./BranchDialogs";
import { CommitDrawer } from "./CommitDrawer";
import { computeGraphLayout, ROW_HEIGHT, VISIBLE_LANES, type GraphRow } from "./layout";
import { RefBadges } from "./RefBadges";
import type { BranchFilter, CommitSummary, RepoRefs } from "./types";
import { useCommitHistory } from "./useCommitHistory";

export interface GraphViewProps {
  repoPath: string;
  active: boolean;
}

const emptyCommits: CommitSummary[] = [];
const filterLabels = { all: "全部分支", local: "本地分支", remote: "远程分支", tags: "Tag" } as const;
const filterKinds = ["all", "local", "remote", "tags"] as const;
const LANE_SPACING = 16;
const LANE_PADDING = 13;
const laneTextColors = [
  "text-lane-0", "text-lane-1", "text-lane-2", "text-lane-3",
  "text-lane-4", "text-lane-5", "text-lane-6", "text-lane-7",
];

export function GraphView({ repoPath, active }: GraphViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const history = useCommitHistory(repoPath, active, scrollRef);
  const actions = useBranchActions(repoPath);
  const { dialog } = actions;
  const commits = history.page?.commits ?? emptyCommits;
  const layout = useMemo(() => computeGraphLayout(commits), [commits]);
  const laneWidth = Math.min(layout.laneCount, VISIBLE_LANES) * LANE_SPACING + LANE_PADDING;
  const virtualList = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: useCallback((index: number) => commits[index].hash, [commits]),
    overscan: 10,
  });
  const virtualRows = virtualList.getVirtualItems();
  const lastIndex = virtualRows.at(-1)?.index ?? -1;
  const loadNext = useEffectEvent(() => history.loadMore());

  useEffect(() => {
    if (!active || history.loading || history.failure || !history.page?.hasMore) return;
    if (lastIndex >= 0 && lastIndex >= commits.length - 30) loadNext();
  }, [active, commits.length, history.failure, history.loading, history.page?.hasMore, lastIndex]);

  function copyMessage(hash: string) {
    const message = graphApi.commitDetail(repoPath, hash)
      .then(({ subject, body }) => [subject, body].filter(Boolean).join("\n\n"));
    void copyText(message, "提交信息");
  }

  function closeDrawer() {
    setSelected(null);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 pb-1">
        <h2 className="text-[12px] font-medium text-muted">提交历史</h2>
        <div className="flex min-w-0 items-center gap-1">
          <GraphFilter value={history.filter} refs={history.refs} onChange={history.selectFilter} />
          <IconButton label="刷新提交历史" onClick={history.refresh} disabled={history.loading === "reset"}>
            <RefreshCw className={cn((history.loading === "reset" || history.loading === "refresh") && "animate-spin")} />
          </IconButton>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [overflow-anchor:none]">
        {commits.length > 0 ? (
          <>
            <div role="list" aria-label="提交历史" className="relative" style={{ height: virtualList.getTotalSize() }}>
              {virtualRows.map(({ index, start }) => {
                const commit = commits[index];
                return (
                  <CommitRow
                    key={commit.hash}
                    commit={commit}
                    row={layout.rows[index]}
                    laneWidth={laneWidth}
                    top={start}
                    selected={selected === commit.hash}
                    refs={history.refs}
                    actions={actions}
                    select={(trigger) => {
                      triggerRef.current = trigger;
                      setSelected(commit.hash);
                    }}
                    copyMessage={() => copyMessage(commit.hash)}
                  />
                );
              })}
            </div>
            {history.loading === "more" && <div className="grid h-9 place-items-center"><Spinner /></div>}
          </>
        ) : history.failure ? (
          <EmptyState className="min-h-full" icon={<CircleAlert />} title="无法读取提交历史" description={history.failure.message} action={<Button size="sm" onClick={history.retry}>重试</Button>} />
        ) : history.page ? (
          <EmptyState className="min-h-full" icon={<GitGraph />} title="还没有提交" />
        ) : (
          <div className="grid h-full place-items-center"><Spinner /></div>
        )}
      </div>

      {commits.length > 0 && history.failure && (
        <div role="alert" className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-2 py-1 text-[12px] text-muted">
          <span>{history.failure.message}</span>
          <Button size="sm" onClick={history.retry}>重试</Button>
        </div>
      )}

      {active && selected && (
        <CommitDrawer
          key={selected}
          repoPath={repoPath}
          hash={selected}
          close={closeDrawer}
          select={setSelected}
        />
      )}
      {active && dialog?.kind === "create" && (
        <CreateBranchDialog
          from={dialog.from}
          close={actions.closeDialog}
          create={(name, checkout) => void actions.createBranch(dialog.startPoint, name, checkout)}
        />
      )}
      {active && dialog?.kind === "merge" && (
        <MergeBranchDialog
          from={dialog.branch.name}
          into={dialog.into}
          close={actions.closeDialog}
          merge={(noFf) => void actions.mergeBranch(dialog.branch, noFf)}
        />
      )}
    </div>
  );
}

function GraphFilter({ value, refs, onChange }: { value: BranchFilter; refs: RepoRefs | null; onChange: (value: BranchFilter) => void }) {
  const options = useMemo(() => [
    ...(refs?.locals.map((branch) => ({ full: `refs/heads/${branch.name}`, name: branch.name, Icon: GitBranch })) ?? []),
    ...(refs?.remotes.map((branch) => ({ full: `refs/remotes/${branch.name}`, name: branch.name, Icon: Cloud })) ?? []),
    ...(refs?.tags.map((tag) => ({ full: `refs/tags/${tag.name}`, name: tag.name, Icon: Tag })) ?? []),
  ], [refs]);
  const selected = value.kind === "ref" ? value.ref : value.kind;
  const label = value.kind === "ref" ? options.find((option) => option.full === value.ref)?.name ?? value.ref : filterLabels[value.kind];

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" variant="ghost" className="min-w-0 gap-1.5" aria-label={`筛选提交 · ${label}`}>
          <Filter aria-hidden="true" className="size-3.5!" />
          <span className="max-w-[180px] truncate">{label}</span>
          <ChevronDown aria-hidden="true" className="size-3! text-muted" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-[min(360px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
        <MenuRadioGroup value={selected} onValueChange={(choice) => {
          const kind = filterKinds.find((filter) => filter === choice);
          onChange(kind ? { kind } : { kind: "ref", ref: choice });
        }}>
          {filterKinds.map((kind) => <MenuRadioItem key={kind} value={kind}>{filterLabels[kind]}</MenuRadioItem>)}
          {options.length > 0 && (
            <>
              <MenuSeparator />
              <MenuLabel>按引用筛选</MenuLabel>
              {options.map(({ full, name, Icon }) => (
                <MenuRadioItem key={full} value={full} textValue={name} title={full}>
                  <span className="flex items-center gap-1.5"><Icon aria-hidden="true" className="size-3 shrink-0 text-muted" /><span className="truncate">{name}</span></span>
                </MenuRadioItem>
              ))}
            </>
          )}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

interface CommitRowProps {
  commit: CommitSummary;
  row: GraphRow;
  laneWidth: number;
  top: number;
  selected: boolean;
  refs: RepoRefs | null;
  actions: BranchActions;
  select: (trigger: HTMLButtonElement) => void;
  copyMessage: () => void;
}

function CommitRow({ commit, row, laneWidth, top, selected, refs, actions, select, copyMessage }: CommitRowProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="listitem"
          className={cn(
            "absolute inset-x-0 flex min-w-0 items-center rounded-md",
            selected ? "bg-accent-soft" : "hover:bg-subtle",
          )}
          style={{ height: ROW_HEIGHT, transform: `translateY(${top}px)` }}
        >
          <Tip content={`${commit.authorName} · ${formatRelativeTime(commit.authorTime)} · ${commit.shortHash}`}>
            <button
              type="button"
              aria-current={selected || undefined}
              className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
              onClick={(event) => select(event.currentTarget)}
            >
              <LaneGraphic row={row} width={laneWidth} />
              <span className="truncate pr-2 text-[13px] text-ink">{commit.subject || "（无标题）"}</span>
            </button>
          </Tip>
          <RefBadges labels={commit.refs} color={row.color} refs={refs} actions={actions} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={<Plus />} disabled={actions.busy} onSelect={() => actions.openCreate(commit.hash, `提交 ${commit.shortHash}`)}>基于此提交创建分支…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Copy />} onSelect={() => void copyText(commit.hash, "提交哈希")}>复制提交哈希</ContextMenuItem>
        <ContextMenuItem icon={<Copy />} onSelect={copyMessage}>复制提交信息</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function LaneGraphic({ row, width }: { row: GraphRow; width: number }) {
  const x = (lane: number) => LANE_PADDING + lane * LANE_SPACING;
  return (
    <svg aria-hidden="true" className="shrink-0 overflow-hidden" width={width} height={ROW_HEIGHT}>
      {row.segments.map(({ from, to, color: index }) => {
        const start = x(from.lane);
        const end = x(to.lane);
        const midpoint = (from.y + to.y) / 2;
        const path = start === end
          ? `M ${start} ${from.y} V ${to.y}`
          : `M ${start} ${from.y} C ${start} ${midpoint}, ${end} ${midpoint}, ${end} ${to.y}`;
        return <path key={`${from.lane}-${from.y}-${to.lane}-${to.y}`} className={laneTextColors[index]} d={path} fill="none" stroke="currentColor" strokeWidth={2} />;
      })}
      {row.lane < VISIBLE_LANES && <circle cx={x(row.lane)} cy={ROW_HEIGHT / 2} r={4.5} className={laneTextColors[row.color]} fill="currentColor" />}
    </svg>
  );
}
