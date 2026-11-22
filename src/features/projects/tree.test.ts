import { describe, expect, it } from "vitest";
import {
  collectNodeIds,
  expandNode,
  findRepo,
  findRepoIn,
  flattenProjects,
  loadExpanded,
  pruneExpanded,
  reconcileSelection,
  sameSelection,
  toggleExpanded,
  type TreeRow,
} from "./tree";
import type { ProjectNode } from "./types";

const projects: ProjectNode[] = [
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
        repos: [
          { path: "/code/backend/casdoor", name: "casdoor" },
          { path: "/code/backend/sso", name: "sso" },
        ],
      },
      {
        id: "f2",
        path: "/code/empty",
        name: "empty",
        exists: true,
        isRepo: false,
        truncated: false,
        repos: [],
      },
      {
        id: "f3",
        path: "/code/gone",
        name: "gone",
        exists: false,
        isRepo: false,
        truncated: false,
        repos: [],
      },
    ],
  },
  { id: "p2", name: "SWClaw", folders: [] },
];

/** 同一个仓库被添加到两个项目 */
const shared: ProjectNode[] = [
  {
    id: "pa",
    name: "A",
    folders: [
      {
        id: "fa",
        path: "/code/a",
        name: "a",
        exists: true,
        isRepo: false,
        truncated: false,
        repos: [{ path: "/code/shared", name: "a/shared" }],
      },
    ],
  },
  {
    id: "pb",
    name: "B",
    folders: [
      {
        id: "fb",
        path: "/code/b",
        name: "b",
        exists: true,
        isRepo: false,
        truncated: false,
        repos: [{ path: "/code/shared", name: "b/shared" }],
      },
    ],
  },
];

/** 便于断言的行摘要 */
function summarize(rows: TreeRow[]): string[] {
  return rows.map((row) => {
    switch (row.kind) {
      case "project":
        return `${row.depth}:project:${row.project.name}`;
      case "folder":
        return `${row.depth}:folder:${row.folder.name}`;
      case "repo":
        return `${row.depth}:repo:${row.repo.name}`;
      case "empty-folder":
        return `${row.depth}:empty-folder:${row.project.name}`;
      case "no-repos":
        return `${row.depth}:no-repos:${row.folder.name}`;
    }
  });
}

describe("flattenProjects", () => {
  it("收起时只显示项目行", () => {
    expect(summarize(flattenProjects(projects, []))).toEqual(["0:project:AgentFlow", "0:project:SWClaw"]);
  });

  it("展开项目后显示文件夹行", () => {
    expect(summarize(flattenProjects(projects, ["p1"]))).toEqual([
      "0:project:AgentFlow",
      "1:folder:backend",
      "1:folder:empty",
      "1:folder:gone",
      "0:project:SWClaw",
    ]);
  });

  it("展开文件夹后显示仓库行，仓库顺序与配置一致", () => {
    const rows = flattenProjects(projects, ["p1", "f1"]);
    expect(summarize(rows)).toEqual([
      "0:project:AgentFlow",
      "1:folder:backend",
      "2:repo:casdoor",
      "2:repo:sso",
      "1:folder:empty",
      "1:folder:gone",
      "0:project:SWClaw",
    ]);
  });

  it("空项目显示添加文件夹入口，空文件夹显示未发现仓库", () => {
    expect(summarize(flattenProjects(projects, ["p1", "f1", "f2", "p2"]))).toEqual([
      "0:project:AgentFlow",
      "1:folder:backend",
      "2:repo:casdoor",
      "2:repo:sso",
      "1:folder:empty",
      "2:no-repos:empty",
      "1:folder:gone",
      "0:project:SWClaw",
      "1:empty-folder:SWClaw",
    ]);
  });

  it("目录不存在的文件夹不展开子节点", () => {
    const rows = flattenProjects(projects, ["p1", "f3"]);
    expect(rows.filter((row) => row.kind === "repo" || row.kind === "no-repos")).toEqual([]);
  });

  it("行 key 唯一（同一仓库被添加到两个项目也不冲突）", () => {
    const keys = flattenProjects([...projects, ...shared], [
      "p1",
      "f1",
      "f2",
      "p2",
      "pa",
      "fa",
      "pb",
      "fb",
    ]).map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("展开状态", () => {
  it("collectNodeIds 收集项目与文件夹 ID", () => {
    expect(collectNodeIds(projects)).toEqual(["p1", "f1", "f2", "f3", "p2"]);
  });

  it("toggleExpanded 展开 / 收起", () => {
    expect(toggleExpanded([], "p1")).toEqual(["p1"]);
    expect(toggleExpanded(["p1", "f1"], "p1")).toEqual(["f1"]);
  });

  it("expandNode 幂等且不改变原数组", () => {
    const original = ["p1"];
    const next = expandNode(original, "f1");
    expect(next).toEqual(["p1", "f1"]);
    expect(original).toEqual(["p1"]);
    expect(expandNode(next, "f1")).toEqual(["p1", "f1"]);
  });

  it("pruneExpanded 去掉已删除的节点并去重", () => {
    expect(pruneExpanded(["p1", "deleted", "f1", "f1", "p2"], projects)).toEqual(["p1", "f1", "p2"]);
  });

  it("没有 localStorage 时视为首次启动", () => {
    expect(loadExpanded()).toBeNull();
  });
});

describe("findRepo / findRepoIn", () => {
  it("按路径找到仓库及其所属项目 / 文件夹", () => {
    const found = findRepo(projects, "/code/backend/sso");
    expect(found?.project.name).toBe("AgentFlow");
    expect(found?.folder.name).toBe("backend");
    expect(found?.repo.path).toBe("/code/backend/sso");
  });

  it("找不到时返回 null", () => {
    expect(findRepo(projects, "/code/nope")).toBeNull();
  });

  it("findRepoIn 只在指定项目内查找", () => {
    expect(findRepoIn(shared, "pa", "/code/shared")?.folder.id).toBe("fa");
    expect(findRepoIn(shared, "pb", "/code/shared")?.folder.id).toBe("fb");
    expect(findRepoIn(shared, "pc", "/code/shared")).toBeNull();
    expect(findRepoIn(shared, "pa", "/code/other")).toBeNull();
  });
});

describe("reconcileSelection", () => {
  const selection = {
    repoPath: "/code/backend/sso",
    repoName: "sso",
    projectId: "p1",
    projectName: "AgentFlow",
  };

  it("没有选中时保持清空", () => {
    expect(reconcileSelection(projects, null)).toBeNull();
  });

  it("命中（projectId, repoPath）时保持原对象", () => {
    expect(reconcileSelection(projects, selection)).toBe(selection);
  });

  it("项目重命名后同步 projectName", () => {
    const renamed: ProjectNode[] = projects.map((project) =>
      project.id === "p1" ? { ...project, name: "AgentFlow 2" } : project,
    );
    const next = reconcileSelection(renamed, selection);
    expect(next).toEqual({ ...selection, projectName: "AgentFlow 2" });
  });

  it("原项目消失但仓库还在其他项目时切换归属", () => {
    const next = reconcileSelection(shared.slice(1), { repoPath: "/code/shared", repoName: "a/shared", projectId: "pa", projectName: "A" });
    expect(next).toEqual({
      repoPath: "/code/shared",
      repoName: "b/shared",
      projectId: "pb",
      projectName: "B",
    });
  });

  it("同一项目内仓库换了文件夹时保持项目", () => {
    const moved: ProjectNode[] = [
      {
        ...shared[0],
        folders: [
          {
            id: "fa2",
            path: "/code/a2",
            name: "a2",
            exists: true,
            isRepo: false,
            truncated: false,
            repos: [{ path: "/code/shared", name: "a2/shared" }],
          },
        ],
      },
    ];
    const next = reconcileSelection(moved, {
      repoPath: "/code/shared",
      repoName: "a/shared",
      projectId: "pa",
      projectName: "A",
    });
    expect(next?.repoName).toBe("a2/shared");
    expect(next?.projectId).toBe("pa");
  });

  it("所有位置都消失时返回 null", () => {
    expect(reconcileSelection([], selection)).toBeNull();
    expect(
      reconcileSelection(projects, { ...selection, repoPath: "/code/removed", repoName: "removed" }),
    ).toBeNull();
  });
});

describe("sameSelection", () => {
  const a = { repoPath: "/code/x", repoName: "x", projectId: "p1", projectName: "P" };

  it("同一对象与同值时相等", () => {
    expect(sameSelection(a, a)).toBe(true);
    expect(sameSelection(a, { ...a })).toBe(true);
    expect(sameSelection(null, null)).toBe(true);
  });

  it("项目或路径不同时不相等", () => {
    expect(sameSelection(a, { ...a, projectId: "p2" })).toBe(false);
    expect(sameSelection(a, { ...a, repoPath: "/code/y" })).toBe(false);
    expect(sameSelection(a, null)).toBe(false);
  });
});
