import { FolderGit2, GitBranch } from "lucide-react";
import { useAppState, type RepoSelection, type ViewTab } from "@/app/AppState";
import { EmptyState } from "@/components/ui/feedback";
import { Pill } from "@/components/ui/pill";
import { ChangesView } from "@/features/changes/ChangesView";
import { SyncActions } from "@/features/changes/SyncActions";
import { GraphView } from "@/features/graph/GraphView";
import { cn } from "@/lib/cn";
import { label, type Preferences } from "@/features/settings/preferences";

const TABS: { id: ViewTab; label: string }[] = [
  { id: "graph", label: "Git Graph" },
  { id: "changes", label: "Changes" },
];

/** 右栏：仓库头部 + Git Graph / Changes 两个视图 */
export function RepoView({ keys }: { keys: Preferences["keys"] }) {
  const { selection, tab, setTab } = useAppState();

  if (!selection) {
    return (
      <EmptyState
        className="flex-1"
        icon={<FolderGit2 />}
        title="选择一个仓库"
        description="在左侧新建项目并添加文件夹，GitDeck 会自动识别其中的 Git 仓库。"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
      <RepoHeader selection={selection} />
      <ViewTabs keys={keys} value={tab} onChange={setTab} />
      {/* 两个视图都保持挂载，切换时保留滚动位置与输入的提交信息；切换仓库时整体重建 */}
      <div key={selection.repoPath} className="relative mt-3 min-h-0 flex-1">
        <section className={cn("absolute inset-0 flex flex-col", tab !== "graph" && "hidden")}>
          <GraphView repoPath={selection.repoPath} active={tab === "graph"} />
        </section>
        <section className={cn("absolute inset-0 flex flex-col", tab !== "changes" && "hidden")}>
          <ChangesView repoPath={selection.repoPath} active={tab === "changes"} />
        </section>
      </div>
    </div>
  );
}

function RepoHeader({ selection }: { selection: RepoSelection }) {
  return (
    <header data-tauri-drag-region className="flex h-12 shrink-0 items-center justify-between gap-3">
      <div className="pointer-events-none flex min-w-0 items-center gap-2">
        <GitBranch className="size-[18px] shrink-0 text-ink" />
        <h1 className="truncate text-[17px] font-semibold text-ink" title={selection.repoPath}>
          {selection.repoName}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SyncActions repoPath={selection.repoPath} />
        <Pill title="所属项目">{selection.projectName}</Pill>
      </div>
    </header>
  );
}

function ViewTabs({ value, onChange, keys }: { keys: Preferences["keys"]; value: ViewTab; onChange: (tab: ViewTab) => void }) {
  return (
    <div role="tablist" aria-label="仓库视图" className="grid shrink-0 grid-cols-2 gap-1">
      {TABS.map((item) => {
        const selected = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            title={`${item.label}（${label(keys[item.id])}）`}
            onClick={() => onChange(item.id)}
            className={cn(
              "h-8 rounded-full text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
              selected ? "bg-subtle font-medium text-ink" : "text-muted hover:text-ink-2",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
