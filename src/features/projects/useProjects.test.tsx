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
        repos: [{ path: "/code/backend/casdoor", name: "casdoor" }],
      },
    ],
  },
];

function SelectionProbe() {
  const { selection } = useAppState();
  return <span data-testid="selection">{selection ? selection.repoPath : "none"}</span>;
}

/** 直接调用 removeFolder，省去右键菜单的交互细节 */
function Harness() {
  const controller = useProjects();
  const project = controller.projects[0];
  const folder = project?.folders[0];
  return (
    <button
      type="button"
      disabled={!project || !folder}
      onClick={() => project && folder && void controller.removeFolder(project, folder)}
    >
      remove-first
    </button>
  );
}

describe("useProjects", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(api).forEach((fn) => fn.mockReset());
    api.list.mockResolvedValue(structuredClone(PROJECTS));
    api.removeFolder.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("移除文件夹导致当前仓库消失时清空选中", async () => {
    localStorage.setItem(
      "gitdeck.ui.v1",
      JSON.stringify({
        selection: {
          repoPath: "/code/backend/casdoor",
          repoName: "casdoor",
          projectId: "p1",
          projectName: "AgentFlow",
        },
        tab: "graph",
      }),
    );

    render(
      <AppStateProvider>
        <Tooltip.Provider>
          <Harness />
          <SelectionProbe />
          <DialogHost />
        </Tooltip.Provider>
      </AppStateProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selection").textContent).toBe("/code/backend/casdoor"));
    fireEvent.click(screen.getByRole("button", { name: "remove-first" }));

    // 先确认，再移除
    fireEvent.click(await screen.findByRole("button", { name: "移除" }));

    await waitFor(() => expect(screen.getByTestId("selection").textContent).toBe("none"));
    expect(api.removeFolder).toHaveBeenCalledWith("p1", "f1");
  });
});
