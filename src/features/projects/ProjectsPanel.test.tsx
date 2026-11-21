// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Tooltip } from "radix-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "@/app/AppState";
import { DialogHost } from "@/components/ui/dialog";
import { ProjectsPanel } from "./ProjectsPanel";
import type { ProjectNode } from "./types";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  addFolder: vi.fn(),
  removeFolder: vi.fn(),
}));

vi.mock("./api", () => ({ projectsApi: api }));

const PROJECTS: ProjectNode[] = [
  {
    id: "p1",
    name: "AgentFlow",
    folders: [
      {
        id: "f1",
        path: "/code/backend",
        name: "backend",
        exists: true,
        isRepo: false,
        repos: [
          { path: "/code/backend/casdoor", name: "casdoor" },
          { path: "/code/backend/sso", name: "sso" },
        ],
      },
      { id: "f2", path: "/code/empty", name: "empty", exists: true, isRepo: false, repos: [] },
      { id: "f3", path: "/code/gone", name: "gone", exists: false, isRepo: false, repos: [] },
    ],
  },
  { id: "p2", name: "SWClaw", folders: [] },
];

function SelectionProbe() {
  const { selection } = useAppState();
  return <span data-testid="selection">{selection ? selection.repoPath : "none"}</span>;
}

function renderPanel() {
  return render(
    <AppStateProvider>
      <Tooltip.Provider>
        <ProjectsPanel />
        <SelectionProbe />
        <DialogHost />
      </Tooltip.Provider>
    </AppStateProvider>,
  );
}

describe("ProjectsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(api).forEach((fn) => fn.mockReset());
    api.list.mockResolvedValue(structuredClone(PROJECTS));
  });

  afterEach(() => {
    cleanup();
  });

  it("首次启动默认全部展开，并把展开状态写入 localStorage", async () => {
    renderPanel();

    await screen.findByText("AgentFlow");
    expect(screen.getByText("backend")).toBeTruthy();
    expect(screen.getByText("casdoor")).toBeTruthy();
    expect(screen.getByText("sso")).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem("gitdeck.projects.expanded") ?? "[]");
    expect(stored).toEqual(["p1", "f1", "f2", "f3", "p2"]);
  });

  it("显示空项目、空文件夹与目录不存在的提示", async () => {
    renderPanel();

    await screen.findByText("未发现 Git 仓库");
    expect(screen.getByText("添加文件夹")).toBeTruthy();
    expect(screen.getByText("目录不存在")).toBeTruthy();
  });

  it("点击仓库切换右侧视图", async () => {
    renderPanel();

    fireEvent.click(await screen.findByText("casdoor"));
    expect(screen.getByTestId("selection").textContent).toBe("/code/backend/casdoor");
  });

  it("点击项目折叠与展开", async () => {
    renderPanel();

    fireEvent.click(await screen.findByText("SWClaw"));
    expect(screen.queryByText("添加文件夹")).toBeNull();
    fireEvent.click(screen.getByText("SWClaw"));
    expect(await screen.findByText("添加文件夹")).toBeTruthy();
  });

  it("当前选中的仓库不在项目中时清空选中", async () => {
    localStorage.setItem(
      "gitdeck.ui.v1",
      JSON.stringify({
        selection: {
          repoPath: "/old/removed-repo",
          repoName: "removed-repo",
          projectId: "p1",
          projectName: "AgentFlow",
        },
        tab: "graph",
      }),
    );

    renderPanel();

    await screen.findByText("AgentFlow");
    await waitFor(() => expect(screen.getByTestId("selection").textContent).toBe("none"));
  });

  it("新建项目后出现在树中并默认展开", async () => {
    api.create.mockResolvedValue({ id: "p3", name: "新项目", folders: [] });

    renderPanel();
    await screen.findByText("AgentFlow");

    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "新项目" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(await screen.findByText("新项目")).toBeTruthy();
    expect(api.create).toHaveBeenCalledWith("新项目");
    // 新项目与 SWClaw 都还没有文件夹，各显示一行「添加文件夹」
    expect(screen.getAllByText("添加文件夹")).toHaveLength(2);
    const stored = JSON.parse(localStorage.getItem("gitdeck.projects.expanded") ?? "[]");
    expect(stored).toContain("p3");
  });

  it("读取失败时显示错误与重试", async () => {
    api.list.mockRejectedValue({ kind: "config", message: "项目配置内容损坏" });

    renderPanel();

    expect(await screen.findByText("项目配置内容损坏")).toBeTruthy();
    api.list.mockResolvedValue(structuredClone(PROJECTS));
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("AgentFlow")).toBeTruthy();
  });
});
