import { Cloud, Copy, GitBranch, Tag } from "lucide-react";
import { HoverCard } from "radix-ui";
import { IconButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { copyText } from "./branchActions";
import { CommitMessage } from "./CommitMessage";
import type { CommitDetail, CommitSummary } from "./types";
import { useGraphRequest } from "./useGraphRequest";

export function CommitPreview({ commit, loadDetail }: {
  commit: CommitSummary;
  loadDetail: (hash: string) => Promise<CommitDetail>;
}) {
  const { data, error } = useGraphRequest(() => loadDetail(commit.hash));
  const totals = data?.files.reduce((sum, file) => {
    sum.additions += file.additions ?? 0;
    sum.deletions += file.deletions ?? 0;
    return sum;
  }, { additions: 0, deletions: 0 });

  return (
    <HoverCard.Content asChild side="bottom" align="center" sideOffset={5} collisionPadding={10} hideWhenDetached>
      <aside aria-label="提交预览"
        className="z-40 max-h-[min(60vh,var(--radix-hover-card-content-available-height))] w-[min(460px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface px-4 py-3 text-ink shadow-pop select-text">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
          <span className="wrap-anywhere font-medium text-ink-2">{commit.authorName}</span>
          <time dateTime={new Date(commit.authorTime * 1000).toISOString()} className="text-muted">{formatRelativeTime(commit.authorTime)} · {formatDateTime(commit.authorTime)}</time>
        </div>
        <CommitMessage subject={data?.subject ?? commit.subject} body={data?.body ?? ""} />
        {error && <p className="mt-2 text-xs text-muted">{error}</p>}
        {!data && !error && <Spinner className="mt-2" />}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2 text-xs text-muted">
          {data && totals && (
            <span className="flex items-center gap-2 tabular-nums">
              {data.files.length} 个文件
              {totals.additions > 0 && <span className="text-diff-add">+{totals.additions}</span>}
              {totals.deletions > 0 && <span className="text-diff-del">−{totals.deletions}</span>}
            </span>
          )}
          {commit.refs.map(ref => {
            const Icon = ref.kind === "tag" ? Tag : ref.kind === "remote" ? Cloud : GitBranch;
            return <span key={ref.fullName} title={ref.fullName} className="inline-flex max-w-full items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-ink-2"><Icon className="size-3 shrink-0" /><span className="truncate">{ref.name}</span></span>;
          })}
          <span className="ml-auto inline-flex items-center gap-1 font-mono">{commit.shortHash}
            <IconButton noTip size="sm" label="复制提交哈希" onClick={() => void copyText(commit.hash, "提交哈希")}><Copy /></IconButton>
          </span>
        </div>
      </aside>
    </HoverCard.Content>
  );
}
