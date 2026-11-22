// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Tooltip } from "radix-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "@/app/AppState";
import { DialogHost } from "@/components/ui/dialog";
import type { ProjectNode } from "./types";
import { useProjects } from "./useProjects";

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
        truncated: false,
        repos: [{ path: "/code/backend/casdoor", name: "casdoor" }],
      },
    ],
  },
];

const WITHOUT_FOLDER: ProjectNode[] = [{ id: "p1", name: "AgentFlow", folders: [] }];

/** 同一个仓库被添加到两个项目 */
const SHARED: ProjectNode[] = [
  {
    id: "pa",
    name: "ProjectA",
    folders: [
      {
        id: "fa",
        path: "/code/a",
        name: "a",
        exists: true,
        isRepo: false,
        truncated: false,
        repos: [{ path: "/code/shared", name: "shared" }],
      },
    ],
  },
  {
    id: "pb",
    name: "ProjectB",
    folders: [
      {
        id: "fb",
        path: "/code/b",
        name: "b",
        exists: true,
        isRepo: false,
        truncated: false,
        repos: [{ path: "/code/shared", name: "shared" }],
      },
    ],
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

function SelectionProbe() {
  const { selection } = useAppState();
  return (
    <span data-testid="selection">
      {selection ? `${selection.projectId}|${selection.projectName}|${selection.repoPath}` : "none"}
    </span>
  );
}

/** 把 hook 的操作暴露成按钮，省去右键菜单的交互细节 */
function Harness() {
  const controller = useProjects();
  const project = controller.projects[0];
  const folder = project?.folders[0];
  return (
    <>
      <span data-testid="tree">
        {controller.projects
          .map((item) => `${item.name}(${item.folders.map((candidate) => candidate.name).join(",")})`)
          .join("|")}
      </span>
      <button type="button" onClick={() => void controller.rescan()}>
        rescan
      </button>
      <button type="button" disabled={!project} onClick={() => project && void controller.renameProject(project)}>
        rename-first
      </button>
      <button
        type="button"
        disabled={!project || !folder}
        onClick={() => project && folder && void controller.removeFolder(project, folder)}
      >
        remove-first
      </button>
      <button type="button" disabled={!project} onClick={() => project && void controller.deleteProject(project)}>
        delete-first
      </button>
      <SelectionProbe />
      <DialogHost />
    </>
  );
}

function renderHarness() {
  return render(
    <AppStateProvider>
      <Tooltip.Provider>
        <Harness />
      </Tooltip.Provider>
    </AppStateProvider>,
  );
}

function seedSelection(selection: { repoPath: string; repoName: string; projectId: string; projectName: string }) {
  localStorage.setItem("gitdeck.ui.v1", JSON.stringify({ selection, tab: "graph" }));
}

async function treeText(): Promise<string> {
  return screen.getByTestId("tree").textContent ?? "";
}

describe("useProjects", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(api).forEach((fn) => fn.mockReset());
    api.list.mockResolvedValue(structuredClone(PROJECTS));
    api.removeFolder.mockResolvedValue(null);
    api.remove.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("移除文件夹导致当前仓库消失时清空选中", async () => {
    seedSelection({
      repoPath: "/code/backend/casdoor",
      repoName: "casdoor",
      projectId: "p1",
      projectName: "AgentFlow",
    });

    renderHarness();
    await waitFor(() => expect(screen.getByTestId("selection").textContent).toBe("p1|AgentFlow|/code/backend/casdoor"));

    api.list.mockResolvedValue(structuredClone(WITHOUT_FOLDER));
    fireEvent.click(screen.getByRole("button", { name: "remove-first" }));
    fireEvent.click(await screen.findByRole("button", { name: "移除" }));

    await waitFor(() => expect(screen.getByTestId("selection").textContent).toBe("none"));
    expect(api.removeFolder).toHaveBeenCalledWith("p1", "f1");
    await waitFor(async () => expect(await treeText()).toBe("AgentFlow()"));
  });

  it("旧的重新扫描响应晚于移除返回时，不会恢复已移除的文件夹", async () => {
    const initial = deferred<ProjectNode[]>();
    const stale = deferred<ProjectNode[]>();
    const fresh = deferred<ProjectNode[]>();
    const queue = [initial, stale, fresh];
    api.list.mockImplementation(() => {
      const next = queue.shift();
      if (!next) throw new Error("出现预期之外的 projects_list 调用");
      return next.promise;
    });

    renderHarness();
    initial.resolve(structuredClone(PROJECTS));
    await waitFor(async () => expect(await treeText()).toBe("AgentFlow(backend)"));

    // 用户点「重新扫描」：旧请求挂起
    fireEvent.click(screen.getByRole("button", { name: "rescan" }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    // 随后移除文件夹：本地立即生效，并发出序号更新的刷新
    fireEvent.click(screen.getByRole("button", { name: "remove-first" }));
    fireEvent.click(await screen.findByRole("button", { name: "移除" }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));

    fresh.resolve(structuredClone(WITHOUT_FOLDER));
    await waitFor(async () => expect(await treeText()).toBe("AgentFlow()"));

    // 旧扫描（仍含 backend）晚到：必须被丢弃
    stale.resolve(structuredClone(PROJECTS));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await treeText()).toBe("AgentFlow()");
  });

  it("重命名只合并名称，不会被返回的完整快照覆盖", async () => {
    const initial = deferred<ProjectNode[]>();
    const refresh = deferred<ProjectNode[]>();
    const queue = [initial, refresh];
    api.list.mockImplementation(() => {
      const next = queue.shift();
      if (!next) throw new Error("出现预期之外的 projects_list 调用");
      return next.promise;
    });
    // 后端返回的完整快照里没有文件夹：只能用它的名字，不能整棵树替换
    api.rename.mockResolvedValue({ id: "p1", name: "新名字", folders: [] });

    renderHarness();
    initial.resolve(structuredClone(PROJECTS));
    await waitFor(async () => expect(await treeText()).toBe("AgentFlow(backend)"));

    fireEvent.click(screen.getByRole("button", { name: "rename-first" }));
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "新名字" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    // 刷新还没返回：名称已合并，文件夹仍在
    await waitFor(async () => expect(await treeText()).toBe("新名字(backend)"));

    refresh.resolve([
      {
        id: "p1",
        name: "新名字",
        folders: [
          {
            id: "f1",
            path: "/code/backend",
            name: "backend",
            exists: true,
            isRepo: false,
            truncated: false,
            repos: [{ path: "/code/backend/casdoor", name: "casdoor" }],
          },
        ],
      },
    ]);
    await waitFor(async () => expect(await treeText()).toBe("新名字(backend)"));
  });

  it("删除项目后，同一仓库的其他项目接管选中", async () => {
    api.list.mockResolvedValue(structuredClone(SHARED));
    seedSelection({ repoPath: "/code/shared", repoName: "shared", projectId: "pa", projectName: "ProjectA" });

    renderHarness();
    await waitFor(() => expect(screen.getByTestId("selection").textContent).toBe("pa|ProjectA|/code/shared"));

    api.list.mockResolvedValue(structuredClone(SHARED.slice(1)));
    fireEvent.click(screen.getByRole("button", { name: "delete-first" }));
    fireEvent.click(await screen.findByRole("button", { name: "删除" }));

    await waitFor(() =>
      expect(screen.getByTestId("selection").textContent).toBe("pb|ProjectB|/code/shared"),
    );
    await waitFor(async () => expect(await treeText()).toBe("ProjectB(b)"));
  });
});
