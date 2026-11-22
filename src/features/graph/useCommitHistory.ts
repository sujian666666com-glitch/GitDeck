import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useRepoChanged } from "@/lib/events";
import { toAppError } from "@/lib/tauri";
import { graphApi } from "./api";
import { ROW_HEIGHT } from "./layout";
import type { BranchFilter, CommitPage, RepoRefs } from "./types";

const PAGE_SIZE = 400;
type LoadMode = "reset" | "refresh" | "more";

interface Snapshot {
  page: CommitPage | null;
  refs: RepoRefs | null;
}

export function useCommitHistory(repoPath: string, active: boolean, scrollRef: RefObject<HTMLDivElement | null>) {
  const [filter, setFilter] = useState<BranchFilter>({ kind: "all" });
  const [data, setData] = useState<Snapshot>({ page: null, refs: null });
  const [loading, setLoading] = useState<LoadMode | null>(null);
  const [failure, setFailure] = useState<{ mode: LoadMode; message: string } | null>(null);
  const pending = useRef<LoadMode | null>(null);
  const generation = useRef(0);
  const dirty = useRef(true);
  const restoreTop = useRef<number | null>(null);

  async function load(mode: LoadMode, selected = filter) {
    if (mode === "more" && (pending.current !== null || !data.page?.hasMore)) return;
    const request = ++generation.current;
    dirty.current = false;
    pending.current = mode;
    setLoading(mode);
    setFailure(null);
    if (mode === "reset") {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setData((previous) => ({ ...previous, page: null }));
    }

    const previous = mode === "reset" ? [] : (data.page?.commits ?? []);
    try {
      const [page, refs] = await Promise.all([
        graphApi.commits(repoPath, {
          filter: selected,
          skip: mode === "more" ? previous.length : 0,
          limit: mode === "refresh" ? Math.max(PAGE_SIZE, previous.length) : PAGE_SIZE,
        }),
        mode === "more" ? data.refs : graphApi.refs(repoPath),
      ]);
      if (generation.current !== request) return;

      if (mode === "refresh" && scrollRef.current && previous.length > 0) {
        const top = scrollRef.current.scrollTop;
        const index = Math.floor(top / ROW_HEIGHT);
        const anchor = previous[index]?.hash;
        const nextIndex = top === 0 || !anchor ? -1 : page.commits.findIndex((commit) => commit.hash === anchor);
        restoreTop.current = nextIndex < 0 ? top : nextIndex * ROW_HEIGHT + (top % ROW_HEIGHT);
      }
      setData({
        page: mode === "more" ? { ...page, commits: [...previous, ...page.commits] } : page,
        refs,
      });
    } catch (error) {
      if (generation.current !== request) return;
      const failure = toAppError(error);
      if (selected.kind === "ref" && failure.kind === "notFound") {
        // A deleted reference can no longer be used as the active filter.
        const all = { kind: "all" } as const;
        setFilter(all);
        void load("reset", all);
      } else {
        setFailure({ mode, message: failure.message });
      }
    } finally {
      if (generation.current === request) {
        pending.current = null;
        setLoading(null);
      }
    }
  }

  const activate = useEffectEvent(() => {
    if (dirty.current) void load("refresh");
  });

  useEffect(() => {
    if (active) activate();
  }, [active]);

  useLayoutEffect(() => {
    if (restoreTop.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = restoreTop.current;
      restoreTop.current = null;
    }
  }, [data.page, scrollRef]);

  useRepoChanged(repoPath, (scope) => {
    if (scope === "worktree") return;
    if (active) void load("refresh");
    else dirty.current = true;
  });

  return {
    ...data,
    filter,
    loading,
    failure,
    selectFilter(selected: BranchFilter) {
      setFilter(selected);
      void load("reset", selected);
    },
    refresh: () => void load("reset"),
    loadMore: () => void load("more"),
    retry: () => failure && void load(failure.mode),
  };
}
