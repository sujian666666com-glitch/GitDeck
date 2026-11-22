// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as dialogs from "@/components/ui/dialog";
import { graphApi } from "./api";
import { useBranchActions } from "./branchActions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([true, false])("force-deletes an unmerged branch only on second confirmation (%s)", async (allowForce) => {
  const confirm = vi.spyOn(dialogs, "confirmDialog").mockResolvedValueOnce(true).mockResolvedValueOnce(allowForce);
  const remove = vi.spyOn(graphApi, "deleteBranch")
    .mockRejectedValueOnce({ kind: "git", message: "分支尚未合并" })
    .mockResolvedValue(undefined);
  const { result } = renderHook(() => useBranchActions("/repo"));

  await act(() => result.current.remove("topic"));

  expect(confirm).toHaveBeenCalledTimes(2);
  expect(confirm).toHaveBeenNthCalledWith(1, expect.objectContaining({ confirmText: "删除", danger: true }));
  expect(confirm).toHaveBeenNthCalledWith(2, expect.objectContaining({ confirmText: "强制删除", danger: true }));
  expect(remove).toHaveBeenNthCalledWith(1, "/repo", "topic", false);
  expect(remove).toHaveBeenCalledTimes(allowForce ? 2 : 1);
  expect(remove.mock.invocationCallOrder[0]).toBeLessThan(confirm.mock.invocationCallOrder[1]);
  if (allowForce) {
    expect(remove).toHaveBeenNthCalledWith(2, "/repo", "topic", true);
    expect(confirm.mock.invocationCallOrder[1]).toBeLessThan(remove.mock.invocationCallOrder[1]);
  }
});
