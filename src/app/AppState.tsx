import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** 当前选中的仓库（由侧边栏项目树设置） */
export interface RepoSelection {
  /** 仓库根目录绝对路径 */
  repoPath: string;
  /** 显示名 */
  repoName: string;
  projectId: string;
  projectName: string;
}

export type ViewTab = "graph" | "changes";

interface PersistedState {
  selection: RepoSelection | null;
  tab: ViewTab;
}

export interface AppStateValue extends PersistedState {
  /** 选中仓库；传 null 清空（例如仓库被移除） */
  selectRepo: (selection: RepoSelection | null) => void;
  setTab: (tab: ViewTab) => void;
}

const STORAGE_KEY = "gitdeck.ui.v1";

function isSelection(value: unknown): value is RepoSelection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["repoPath", "repoName", "projectId", "projectName"].every((key) => typeof v[key] === "string");
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<PersistedState>;
      return {
        selection: isSelection(data.selection) ? data.selection : null,
        tab: data.tab === "changes" ? "changes" : "graph",
      };
    }
  } catch {
    // 本地状态损坏时忽略，回到初始状态
  }
  return { selection: null, tab: "graph" };
}

const AppStateContext = createContext<AppStateValue | null>(null);

/** 界面状态（选中仓库、当前视图），保存在 localStorage，重启后恢复 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const selectRepo = useCallback((selection: RepoSelection | null) => setState((s) => ({ ...s, selection })), []);
  const setTab = useCallback((tab: ViewTab) => setState((s) => ({ ...s, tab })), []);

  const value = useMemo<AppStateValue>(() => ({ ...state, selectRepo, setTab }), [state, selectRepo, setTab]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState 需要在 AppStateProvider 内使用");
  return value;
}
