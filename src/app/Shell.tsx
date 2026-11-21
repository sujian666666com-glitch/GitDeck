import { GitBranch } from "lucide-react";
import { RepoView } from "@/app/RepoView";
import { ProjectsPanel } from "@/features/projects/ProjectsPanel";
import { isMac } from "@/lib/runtime";

/** 极简双栏布局：左侧项目树，右侧当前仓库视图 */
export function Shell() {
  return (
    <div className="flex h-full">
      <aside className="flex w-[272px] shrink-0 flex-col border-r border-line bg-app">
        {isMac && <div data-tauri-drag-region className="h-7 shrink-0" />}
        <BrandHeader />
        <div className="mx-4 h-px shrink-0 bg-line" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProjectsPanel />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-app">
        {isMac && <div data-tauri-drag-region className="h-7 shrink-0" />}
        <RepoView />
      </main>
    </div>
  );
}

function BrandHeader() {
  return (
    <div data-tauri-drag-region className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
      <div className="pointer-events-none flex items-center gap-2">
        <GitBranch className="size-[18px] text-ink" strokeWidth={2} />
        <span className="text-[17px] font-semibold tracking-tight text-ink">GitDeck</span>
      </div>
      <span className="pointer-events-none truncate text-[12px] text-muted">桌面 Git 管理工具</span>
    </div>
  );
}
