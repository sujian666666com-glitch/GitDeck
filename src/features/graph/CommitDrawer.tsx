import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, CircleAlert, Copy, FileText, GitCommitHorizontal, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useCallback, useRef, useState } from "react";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { CommitMessage } from "./CommitMessage";
import { useGraphRequest } from "./useGraphRequest";
import { graphApi } from "./api";
import { copyText } from "./branchActions";
import type { CommitDetail, CommitFile, FileChangeKind } from "./types";

const fileStatus: Record<FileChangeKind, { letter: string; name: string; tone: string }> = {
  added: { letter: "A", name: "新增", tone: "bg-st-added-bg text-st-added" },
  modified: { letter: "M", name: "修改", tone: "bg-st-modified-bg text-st-modified" },
  deleted: { letter: "D", name: "删除", tone: "bg-st-deleted-bg text-st-deleted" },
  renamed: { letter: "R", name: "重命名", tone: "bg-st-renamed-bg text-st-renamed" },
  copied: { letter: "C", name: "复制", tone: "bg-st-renamed-bg text-st-renamed" },
  typeChanged: { letter: "T", name: "类型变更", tone: "bg-st-modified-bg text-st-modified" },
  unmerged: { letter: "U", name: "冲突", tone: "bg-st-conflict-bg text-st-conflict" },
  unknown: { letter: "?", name: "未知状态", tone: "bg-subtle text-muted" },
};

interface DrawerProps {
  repoPath: string;
  hash: string;
  loadDetail: (hash: string) => Promise<CommitDetail>;
  close: () => void;
  select: (hash: string) => void;
}

export function CommitDrawer({ repoPath, hash, loadDetail, close, select }: DrawerProps) {
  const [file, setFile] = useState<CommitFile | null>(null);
  const request = useGraphRequest(() => loadDetail(hash));

  return (
    <Dialog.Root open modal={false} onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Content
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (event.defaultPrevented) return;
          event.preventDefault();
          if (event.repeat) return;
          if (file) setFile(null);
          else close();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={cn(
          "absolute inset-y-0 right-0 z-20 flex max-w-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop outline-none",
          file ? "w-[680px]" : "w-[440px]",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
          {file ? (
            <>
              {/* 聚焦时弹出的 Tooltip 会先收到 Esc。 */}
              <IconButton autoFocus noTip label="返回文件列表" onClick={() => setFile(null)}><ArrowLeft /></IconButton>
              <Dialog.Title className="min-w-0 flex-1 truncate font-medium" title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}>
                {file.oldPath && <span className="text-muted">{file.oldPath} → </span>}{file.path}
              </Dialog.Title>
            </>
          ) : (
            <>
              <GitCommitHorizontal aria-hidden="true" className="mr-1 size-4 text-muted" />
              <Dialog.Title className="text-[13px] font-medium">提交详情</Dialog.Title>
              <Button variant="ghost" size="sm" className="gap-1.5 font-mono text-muted" onClick={() => void copyText(hash, "提交哈希")} aria-label="复制提交哈希">
                {request.data?.shortHash ?? hash.slice(0, 7)}<Copy className="size-3!" />
              </Button>
              <div className="flex-1" />
            </>
          )}
          <IconButton label="关闭提交详情" onClick={close}><X /></IconButton>
        </div>
        {file ? (
          <CommitDiff repoPath={repoPath} hash={hash} file={file} />
        ) : request.data ? (
          <CommitContents detail={request.data} select={select} openFile={setFile} />
        ) : (
          <DetailFeedback message={request.error} retry={request.retry} />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function CommitContents({ detail, select, openFile }: { detail: CommitDetail; select: (hash: string) => void; openFile: (file: CommitFile) => void }) {
  const fileScroll = useRef<HTMLDivElement>(null);
  const files = useVirtualizer({
    count: detail.files.length,
    getScrollElement: () => fileScroll.current,
    estimateSize: () => 32,
    overscan: 8,
    getItemKey: useCallback((index: number) => detail.files[index].path, [detail.files]),
  });
  const committerDiffers = detail.authorName !== detail.committerName || detail.authorEmail !== detail.committerEmail || detail.authorTime !== detail.commitTime;

  return (
    <>
      <section className="max-h-[54%] shrink-0 overflow-auto border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px]">
          <span className="min-w-0 break-all font-medium text-ink-2 select-text" title={detail.authorEmail}>{detail.authorName}</span>
          <time dateTime={new Date(detail.authorTime * 1000).toISOString()} className="text-muted">
            {formatDateTime(detail.authorTime)} · {formatRelativeTime(detail.authorTime)}
          </time>
        </div>
        {committerDiffers && (
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] text-muted">
            <span className="break-all select-text" title={detail.committerEmail}>提交者 {detail.committerName}</span>
            <span>{formatDateTime(detail.commitTime)}</span>
          </div>
        )}
        <div className="mt-3"><CommitMessage subject={detail.subject} body={detail.body} /></div>
        {detail.parents.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            <span>父提交</span>
            {detail.parents.map((parent) => (
              <button key={parent} type="button" title={parent} className="rounded bg-subtle px-1.5 py-0.5 font-mono text-ink-2 hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus" onClick={() => select(parent)}>
                {parent.slice(0, 7)}
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="flex shrink-0 items-center gap-1.5 px-4 py-2 text-[12px] font-medium text-muted">
        <FileText className="size-3.5" aria-hidden="true" />变更文件 <span className="tabular-nums">{detail.files.length}</span>
      </div>
      {detail.files.length === 0 ? (
        <p className="px-4 py-2 text-[12px] text-muted">此提交没有文件变更</p>
      ) : (
        <div ref={fileScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative" style={{ height: files.getTotalSize() }}>
            {files.getVirtualItems().map(({ index, key, start, size }) => (
              <FileRow key={key} file={detail.files[index]} top={start} height={size} open={openFile} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function FileRow({ file, top, height, open }: { file: CommitFile; top: number; height: number; open: (file: CommitFile) => void }) {
  const status = fileStatus[file.kind];
  const pathLabel = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
  return (
    <button
      type="button"
      onClick={() => open(file)}
      style={{ top, height }}
      className="absolute inset-x-0 flex items-center gap-2 px-4 text-left hover:bg-subtle focus-visible:bg-accent-soft focus-visible:outline-none"
    >
      <span title={status.name} aria-label={status.name} className={cn("grid size-[18px] shrink-0 place-items-center rounded text-[11px] font-semibold", status.tone)}>
        {status.letter}
      </span>
      <span title={pathLabel} className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{pathLabel}</span>
      <span className="flex shrink-0 gap-2 text-[11px] tabular-nums">
        {file.additions !== null && <span className="text-diff-add">+{file.additions}</span>}
        {file.deletions !== null && <span className="text-diff-del">−{file.deletions}</span>}
      </span>
    </button>
  );
}

function CommitDiff({ repoPath, hash, file }: { repoPath: string; hash: string; file: CommitFile }) {
  const request = useGraphRequest(() => graphApi.commitFileDiff(repoPath, hash, file.path, file.oldPath));
  if (request.data) return <DiffViewer className="min-h-0 flex-1" diff={request.data} />;
  return <DetailFeedback message={request.error} retry={request.retry} />;
}

function DetailFeedback({ message, retry }: { message: string | null; retry: () => void }) {
  return message ? (
    <EmptyState className="flex-1" icon={<CircleAlert />} title="读取失败" description={message} action={<Button size="sm" onClick={retry}>重试</Button>} />
  ) : (
    <div className="grid flex-1 place-items-center"><Spinner /></div>
  );
}
