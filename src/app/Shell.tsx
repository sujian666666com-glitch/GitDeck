import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useAppState } from "./AppState";
import { Settings } from "@/features/settings/Settings";
import { chord, label, usePreferences } from "@/features/settings/preferences";
import { IconButton } from "@/components/ui/button";
import { emitRepoChanged } from "@/lib/events";
import { GitBranch, SquareTerminal, X } from "lucide-react";
import { RepoView } from "@/app/RepoView";
import { ProjectsPanel } from "@/features/projects/ProjectsPanel";
import { isMac } from "@/lib/runtime";

const TerminalPane = lazy(() => import("@/features/terminal/TerminalPane"));

/** 极简双栏布局：左侧项目树，右侧当前仓库视图 */
export function Shell() {
  const { prefs, setPrefs, dark } = usePreferences();
  const { selection, setTab } = useAppState();
  const path = selection?.repoPath;
  const [panels, setPanels] = useState<Map<string, boolean>>(() => new Map());
  const toggle = useCallback(() => {
    if (path) setPanels(old => new Map(old).set(path, !old.get(path)));
  }, [path]);
  const close = () => {
    if (!path) return;
    setPanels(old => {
      const next = new Map(old);
      next.delete(path);
      return next;
    });
    emitRepoChanged(path);
  };
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (!path || event.isComposing || event.defaultPrevented || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = chord(event);
      if (key === prefs.keys.terminal) { if (!event.repeat) toggle(); }
      else if (key === prefs.keys.graph) setTab("graph");
      else if (key === prefs.keys.changes) setTab("changes");
      else return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [path, prefs.keys, setTab, toggle]);
  return (
    <div className="flex h-full">
      <aside className="flex w-[272px] shrink-0 flex-col border-r border-line bg-app">
        {isMac && <div data-tauri-drag-region className="h-7 shrink-0" />}
        <BrandHeader />
        <div className="mx-4 h-px shrink-0 bg-line" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProjectsPanel />
        </div>
        <Settings prefs={prefs} save={setPrefs} />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-app">
        {isMac && <div data-tauri-drag-region className="h-7 shrink-0" />}
        <RepoView keys={prefs.keys} />
        {path && <div className="flex shrink-0 items-center justify-between border-t border-line px-4 py-1">
          <button className="flex items-center gap-2 rounded-md px-2 py-1 text-muted hover:bg-hover hover:text-ink" aria-expanded={!!panels.get(path)} onClick={toggle} title={label(prefs.keys.terminal)}>
            <SquareTerminal size={15} />终端
          </button>
          {panels.get(path) && <IconButton label="关闭终端会话" onClick={close}><X /></IconButton>}
        </div>}
        {Array.from(panels, ([repoPath, open]) => <Suspense key={repoPath} fallback={null}>
          <TerminalPane path={repoPath} dark={dark} visible={repoPath === path && open} />
        </Suspense>)}
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
