// @vitest-environment jsdom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Tooltip } from "radix-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphView } from "./GraphView";
import { graphMock } from "./mock";

function renderGraph(repoPath: string) {
  const invoke = vi.fn<Parameters<typeof mockIPC>[0]>((command, payload) => graphMock[command](payload ?? {}));
  mockIPC(invoke);
  render(<Tooltip.Provider><GraphView repoPath={repoPath} active /></Tooltip.Provider>);
  return invoke;
}

function escape() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

describe("Git Graph interactions", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(400);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(800);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    clearMocks();
    vi.restoreAllMocks();
  });

  it("悬停读取提交并渲染正文，单击在抽屉复用该详情", async () => {
    const invoke = renderGraph("/hover-preview");
    const first = await screen.findByRole("button", { name: "feat: add login" });
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 60, 520, 32));
    const other = screen.getByRole("button", { name: "fix: authentication" });
    fireEvent.pointerEnter(other, { pointerType: "mouse" });
    fireEvent.pointerLeave(other, { pointerType: "mouse" });
    expect(invoke.mock.calls.some(([command]) => command === "graph_commit_detail")).toBe(false);
    fireEvent.pointerEnter(first, { pointerType: "mouse" });
    const preview = within(await screen.findByRole("complementary", { name: "提交预览" }));
    await preview.findByText("add-sso-login");
    expect(preview.getAllByRole("listitem")).toHaveLength(2);
    expect(preview.getByText("sso.authorize(user)").tagName).toBe("CODE");
    expect(preview.getByText("+7")).toBeTruthy();

    fireEvent.click(first);
    const drawer = within(await screen.findByRole("dialog", { name: "提交详情" }));
    await drawer.findByText("add-sso-login");
    expect(drawer.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("complementary", { name: "提交预览" })).toBeNull();
    expect(invoke.mock.calls.filter(([command]) => command === "graph_commit_detail")).toHaveLength(1);
  });

  it("closes the top overlay first, then returns from Diff, then closes the drawer", async () => {
    renderGraph("/escape-test");
    fireEvent.click(await screen.findByRole("button", { name: "feat: add login" }));
    fireEvent.click(await screen.findByRole("button", { name: /src\/auth\/login\.ts/ }));
    await screen.findByRole("heading", { name: "src/auth/login.ts" });

    fireEvent.keyDown(screen.getByRole("button", { name: /筛选提交/ }), { key: "Enter" });
    await screen.findByRole("menu");
    escape();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.getByRole("heading", { name: "src/auth/login.ts" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "agentflow" }));
    await screen.findByText("切换到此分支");
    escape();
    await waitFor(() => expect(screen.queryByText("切换到此分支")).toBeNull());
    expect(screen.getByRole("heading", { name: "src/auth/login.ts" })).toBeTruthy();

    // Moving focus off the restored Ref trigger also dismisses its tooltip.
    screen.getByRole("button", { name: "agentflow" }).blur();
    fireEvent.contextMenu(screen.getByRole("button", { name: "feat: add login" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "基于此提交创建分支…" }));
    await screen.findByRole("dialog", { name: "创建分支" });
    escape();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "创建分支" })).toBeNull());
    expect(screen.getByRole("heading", { name: "src/auth/login.ts" })).toBeTruthy();

    escape();
    await screen.findByRole("heading", { name: "提交详情" });
    expect(screen.getByText("变更文件")).toBeTruthy();
    escape();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "提交详情" })).toBeNull());
  });

  it("submits checkout and no-ff choices from the graph and remembers them on reopen", async () => {
    const invoke = renderGraph("/branch-dialog-test");
    const commit = await screen.findByRole("button", { name: "feat: add login" });
    fireEvent.contextMenu(commit);
    fireEvent.click(await screen.findByRole("menuitem", { name: "基于此提交创建分支…" }));
    const create = await screen.findByRole("dialog", { name: "创建分支" });
    const checkout = within(create).getByRole("checkbox") as HTMLInputElement;
    expect(checkout.checked).toBe(false);
    fireEvent.click(within(create).getByRole("button", { name: "创建" }));
    expect(within(create).getByRole("alert").textContent).toBe("请输入分支名称");
    fireEvent.change(within(create).getByRole("textbox", { name: "分支名称" }), { target: { value: "feature/esc" } });
    fireEvent.click(checkout);
    fireEvent.click(within(create).getByRole("button", { name: "创建" }));
    expect(invoke).toHaveBeenCalledWith("branch_create", expect.objectContaining({
      name: "feature/esc", startPoint: expect.stringMatching(/^a7[0-9a-f]{38}$/), checkout: true,
    }));

    fireEvent.click(await screen.findByRole("button", { name: "feature/esc" }));
    fireEvent.click(await screen.findByRole("button", { name: "基于此创建分支…" }));
    const fromRef = await screen.findByRole("dialog", { name: "创建分支" });
    expect((within(fromRef).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    fireEvent.change(within(fromRef).getByRole("textbox", { name: "分支名称" }), { target: { value: "feature/ref-copy" } });
    fireEvent.click(within(fromRef).getByRole("checkbox"));
    fireEvent.click(within(fromRef).getByRole("button", { name: "创建" }));
    expect(invoke).toHaveBeenCalledWith("branch_create", expect.objectContaining({
      name: "feature/ref-copy", startPoint: "refs/heads/feature/esc", checkout: false,
    }));

    async function openMerge() {
      fireEvent.click(screen.getByRole("button", { name: "agentflow" }));
      fireEvent.click(await screen.findByRole("button", { name: "合并到当前分支" }));
      return screen.findByRole("dialog", { name: "合并到当前分支？" });
    }
    const merge = await openMerge();
    const noFf = within(merge).getByRole("checkbox") as HTMLInputElement;
    expect(noFf.checked).toBe(true);
    expect(within(merge).getByText("将 agentflow 合并到当前分支 feature/esc。")).toBeTruthy();
    fireEvent.click(noFf);
    fireEvent.click(within(merge).getByRole("button", { name: "合并" }));
    expect(invoke).toHaveBeenCalledWith("branch_merge", expect.objectContaining({ name: "refs/heads/agentflow", noFf: false }));
    await waitFor(() => expect(screen.getByRole("button", { name: "agentflow" })).toBeTruthy());
    const reopened = await openMerge();
    expect((within(reopened).getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
});
