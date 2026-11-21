import { describe, expect, it } from "vitest";
import {
  collectNodeIds,
  expandNode,
  findRepo,
  flattenProjects,
  loadExpanded,
  pruneExpanded,
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
        repos: [],
      },
      {
        id: "f3",
        path: "/code/gone",
        name: "gone",
        exists: false,
        isRepo: false,
        repos: [],
      },
    ],
  },
  { id: "p2", name: "SWClaw", folders: [] },
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
    const duplicated: ProjectNode[] = [
      ...projects,
      {
        id: "p3",
        name: "Other",
        folders: [
          {
            id: "f9",
            path: "/code/other",
            name: "other",
            exists: true,
            isRepo: false,
            repos: [{ path: "/code/backend/casdoor", name: "casdoor" }],
          },
        ],
      },
    ];
    const keys = flattenProjects(duplicated, ["p1", "f1", "f2", "p2", "p3", "f9"]).map((row) => row.key);
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

describe("findRepo", () => {
  it("按路径找到仓库及其所属项目 / 文件夹", () => {
    const found = findRepo(projects, "/code/backend/sso");
    expect(found?.project.name).toBe("AgentFlow");
    expect(found?.folder.name).toBe("backend");
    expect(found?.repo.path).toBe("/code/backend/sso");
  });

  it("找不到时返回 null", () => {
    expect(findRepo(projects, "/code/nope")).toBeNull();
  });
});
