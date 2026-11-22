import { ArrowLeft, ArrowRight, CircleDot, Cloud, GitBranch, GitMerge, Plus, Tag, Trash2 } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { BranchActions } from "./branchActions";
import type { RefKind, RefLabel, RepoRefs } from "./types";

const MAX_BADGES = 2;
const icons = { head: CircleDot, local: GitBranch, remote: Cloud, tag: Tag } satisfies Record<RefKind, typeof Tag>;
const labels: Record<RefKind, string> = { head: "分离 HEAD", local: "本地分支", remote: "远程分支", tag: "Tag" };
const badgeClass = "flex h-5 min-w-0 max-w-[180px] items-center gap-1 rounded-full px-2 text-[11px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-focus";

interface BadgeProps {
  refs: RepoRefs | null;
  actions: BranchActions;
}

export function RefBadges({ labels: refsOnCommit, color, refs, actions }: BadgeProps & { labels: RefLabel[]; color: number }) {
  if (refsOnCommit.length === 0) return null;
  const overflow = refsOnCommit.slice(MAX_BADGES);
  const colorStyle = { "--ref-color": `var(--color-lane-${color})` } as CSSProperties;
  return (
    <div className="ml-auto flex max-w-[57%] min-w-0 shrink-0 items-center justify-end gap-1 pr-2" style={colorStyle}>
      {refsOnCommit.slice(0, MAX_BADGES).map((label) =>
        <RefBadge key={label.fullName} label={label} refs={refs} actions={actions} />
      )}
      {overflow.length > 0 && <OverflowRefs labels={overflow} refs={refs} actions={actions} />}
    </div>
  );
}

function RefBadge({ label, refs, actions }: BadgeProps & { label: RefLabel }) {
  const [open, setOpen] = useState(false);
  const Icon = icons[label.kind];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip content={label.fullName}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              badgeClass,
              "text-[color:color-mix(in_srgb,var(--ref-color)_58%,var(--color-ink))]",
              label.isCurrent
                ? "bg-[color:color-mix(in_srgb,var(--ref-color)_25%,var(--color-surface))] font-semibold"
                : "bg-[color:color-mix(in_srgb,var(--ref-color)_14%,var(--color-surface))]",
              "hover:ring-1 hover:ring-[var(--ref-color)]",
            )}
          >
            <Icon aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">{label.name}</span>
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end">
        <RefDetails label={label} refs={refs} actions={actions} close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function OverflowRefs({ labels: hidden, refs, actions }: BadgeProps & { labels: RefLabel[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const item = hidden.find((label) => label.fullName === selected);
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setSelected(null);
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`显示其余 ${hidden.length} 个引用`} className={cn(badgeClass, "shrink-0 bg-subtle text-muted hover:bg-hover")}>
          +{hidden.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end">
        {item ? (
          <>
            <div className="mb-1 flex items-center gap-1 text-muted">
              <IconButton size="sm" label="返回引用列表" onClick={() => setSelected(null)}><ArrowLeft /></IconButton>
              <span className="text-[12px]">引用列表</span>
            </div>
            <RefDetails label={item} refs={refs} actions={actions} close={() => changeOpen(false)} />
          </>
        ) : (
          <div className="max-h-64 overflow-auto">
            {hidden.map((label) => {
              const Icon = icons[label.kind];
              return (
                <RefAction key={label.fullName} icon={<Icon />} onClick={() => setSelected(label.fullName)}>
                  <span className="truncate" title={label.fullName}>{label.name}</span>
                </RefAction>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RefDetails({ label, refs, actions, close }: BadgeProps & { label: RefLabel; close: () => void }) {
  const Icon = icons[label.kind];
  const local = label.kind === "local" ? refs?.locals.find((branch) => branch.name === label.name) : undefined;
  const trackedBy = label.kind === "remote" ? refs?.locals.filter((branch) => branch.upstream === label.name) ?? [] : [];
  const into = refs?.head.hash ? refs.head.branch : null;

  function select(action: () => void) {
    close();
    action();
  }

  return (
    <div>
      <div className="flex min-w-0 items-start gap-2">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="font-semibold break-all select-text">{label.name}</p>
          <p className="text-[12px] text-muted">{labels[label.kind]}{label.isCurrent && " · 当前检出"}</p>
        </div>
      </div>
      {local && (
        <div className="mt-2 space-y-0.5 text-[12px] text-muted">
          <p className="break-all">上游 {local.upstream ?? "未设置"}</p>
          {local.upstream && <p className="tabular-nums">领先 {local.ahead} · 落后 {local.behind}</p>}
        </div>
      )}
      {label.kind === "remote" && (
        <p className="mt-2 text-[12px] break-all text-muted">本地跟踪 {trackedBy.map((branch) => branch.name).join("、") || "无"}</p>
      )}
      <div className="mt-2 border-t border-line pt-1">
        {label.kind === "local" && !label.isCurrent &&
          <RefAction disabled={actions.busy} icon={<ArrowRight />} onClick={() => select(() => void actions.checkout(label.name))}>切换到此分支</RefAction>}
        {label.kind === "remote" &&
          <RefAction disabled={actions.busy} icon={<Cloud />} onClick={() => select(() => void actions.checkoutRemote(label))}>检出为本地分支</RefAction>}
        {into && !label.isCurrent &&
          <RefAction disabled={actions.busy} icon={<GitMerge />} onClick={() => select(() => actions.openMerge(label, into))}>合并到当前分支</RefAction>}
        <RefAction disabled={actions.busy} icon={<Plus />} onClick={() => select(() => actions.openCreate(label.fullName, `${labels[label.kind]} ${label.name}`))}>基于此创建分支…</RefAction>
        {label.kind === "local" && !label.isCurrent &&
          <RefAction disabled={actions.busy} danger icon={<Trash2 />} onClick={() => select(() => void actions.remove(label.name))}>删除分支</RefAction>}
      </div>
    </div>
  );
}

function RefAction({ children, icon, onClick, danger, disabled }: { children: ReactNode; icon: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 [&_svg]:size-[14px] [&_svg]:shrink-0",
        danger ? "text-st-deleted hover:bg-st-deleted-bg" : "text-ink-2 hover:bg-subtle [&_svg]:text-muted",
      )}
    >
      {icon}{children}
    </button>
  );
}
