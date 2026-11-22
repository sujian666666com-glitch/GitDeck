// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { graphApi } from "./api";
import type { CommitSummary } from "./types";
import { useCommitHistory } from "./useCommitHistory";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function commit(hash: string): CommitSummary {
  return { hash, shortHash: hash, parents: [], subject: hash, authorName: "", authorEmail: "", authorTime: 0, refs: [] };
}

it("deduplicates overlapping pages and advances past every returned entry", async () => {
  const initial = [commit("first"), commit("second")];
  const third = commit("third");
  const last = commit("last");
  const fetch = vi.spyOn(graphApi, "commits")
    .mockResolvedValueOnce({ commits: initial, hasMore: true })
    .mockResolvedValueOnce({ commits: [initial[1], third, third], hasMore: true })
    .mockResolvedValueOnce({ commits: [third], hasMore: true })
    .mockResolvedValueOnce({ commits: [last], hasMore: false });
  vi.spyOn(graphApi, "refs").mockResolvedValue({ head: { branch: "main", hash: "first", detached: false }, locals: [], remotes: [], tags: [] });
  const scroll = { current: null };
  const { result } = renderHook(() => useCommitHistory("/repo", true, scroll));
  await waitFor(() => expect(result.current.page?.commits).toEqual(initial));
  for (const nextSkip of [2, 5, 6]) {
    await act(async () => result.current.loadMore());
    expect(fetch).toHaveBeenLastCalledWith("/repo", expect.objectContaining({ skip: nextSkip }));
  }
  expect(result.current.page).toEqual({ commits: [...initial, third, last], hasMore: false });
});
