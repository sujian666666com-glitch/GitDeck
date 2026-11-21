import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * 仓库变化事件总线：Graph、Changes、顶部同步按钮之间互相通知刷新。
 * - refs：分支、Tag、HEAD 变化（切换 / 创建 / 删除分支、fetch）
 * - worktree：工作区或暂存区变化（暂存、丢弃）
 * - all：两者都可能变化（提交、合并、pull、窗口重新获得焦点）
 */
export type ChangeScope = "refs" | "worktree" | "all";

type Listener = (repoPath: string, scope: ChangeScope) => void;

const listeners = new Set<Listener>();

/** 任何会改变仓库状态的操作成功后调用 */
export function emitRepoChanged(repoPath: string, scope: ChangeScope = "all"): void {
  for (const listener of [...listeners]) listener(repoPath, scope);
}

/**
 * 订阅某个仓库的变化。窗口重新获得焦点时也会以 "all" 触发，
 * 用来感知用户在外部编辑器、终端里做的改动。
 */
export function useRepoChanged(repoPath: string | null, onChange: (scope: ChangeScope) => void): void {
  const callback = useRef(onChange);
  useLayoutEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    if (!repoPath) return;
    const listener: Listener = (path, scope) => {
      if (path === repoPath) callback.current(scope);
    };
    let lastFocus = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocus < 800) return; // focus 与 visibilitychange 常常连续触发
      lastFocus = now;
      callback.current("all");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };

    listeners.add(listener);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [repoPath]);
}
