import { describe, expect, it } from "vitest";
import { projectsMock } from "./mock";
import type { FolderNode, ProjectNode } from "./types";

function call<T>(command: keyof typeof projectsMock, args: unknown): T {
  return projectsMock[command](args) as T;
}

async function expectError(fn: () => unknown, kind: string, message?: string) {
  try {
    fn();
  } catch (err) {
    const error = err as { kind?: string; message?: string };
    expect(error.kind).toBe(kind);
    if (message) expect(error.message).toContain(message);
    return;
  }
  throw new Error("预期抛出错误");
}

describe("projectsMock", () => {
  it("初始数据与原型一致", () => {
    const projects = call<ProjectNode[]>("projects_list", {});
    expect(projects.map((project) => project.name)).toEqual(["AgentFlow", "SWClaw"]);
    expect(projects[0].folders[0].repos.map((repo) => repo.name)).toEqual(["casdoor", "casdoor-sso"]);
  });

  it("新建项目会去掉首尾空格并校验名称", async () => {
    const project = call<ProjectNode>("projects_create", { name: "  Demo  " });
    expect(project.name).toBe("Demo");

    await expectError(() => call("projects_create", { name: "   " }), "invalid", "不能为空");
    await expectError(() => call("projects_create", { name: "名".repeat(65) }), "invalid", "64");
  });

  it("添加文件夹时识别仓库、拒绝重复路径", async () => {
    const project = call<ProjectNode>("projects_create", { name: "P" });
    const folder = call<FolderNode>("projects_add_folder", {
      projectId: project.id,
      path: "/Users/demo/code/website",
    });
    expect(folder.name).toBe("website");
    expect(folder.isRepo).toBe(false);
    expect(folder.repos.map((repo) => repo.name)).toEqual(["docs", "landing"]);

    await expectError(
      () => call("projects_add_folder", { projectId: project.id, path: "/Users/demo/code/website/" }),
      "invalid",
      "已在项目中",
    );
  });

  it("文件夹本身是仓库时只返回自己", () => {
    const project = call<ProjectNode>("projects_create", { name: "Tools" });
    const folder = call<FolderNode>("projects_add_folder", {
      projectId: project.id,
      path: "/Users/demo/code/tools",
    });
    expect(folder.isRepo).toBe(true);
    expect(folder.repos).toEqual([{ path: "/Users/demo/code/tools", name: "tools" }]);
  });

  it("未知目录没有仓库", () => {
    const project = call<ProjectNode>("projects_create", { name: "Empty" });
    const folder = call<FolderNode>("projects_add_folder", {
      projectId: project.id,
      path: "/Users/demo/code/gitdeck",
    });
    expect(folder.repos).toEqual([]);
    expect(folder.truncated).toBe(false);
  });

  it("访问预算用尽的目录标记为部分结果", () => {
    const project = call<ProjectNode>("projects_create", { name: "Monorepo" });
    const folder = call<FolderNode>("projects_add_folder", {
      projectId: project.id,
      path: "/Users/demo/code/monorepo",
    });
    expect(folder.truncated).toBe(true);
    expect(folder.repos.map((repo) => repo.name)).toEqual(["apps/admin", "apps/web"]);
  });

  it("不 trim 路径（目录名可能以空格结尾）", () => {
    const project = call<ProjectNode>("projects_create", { name: "Spaces" });
    const folder = call<FolderNode>("projects_add_folder", {
      projectId: project.id,
      path: "/Users/demo/code/gitdeck ",
    });
    expect(folder.path).toBe("/Users/demo/code/gitdeck ");
    expect(folder.name).toBe("gitdeck ");
  });

  it("不存在的项目 / 文件夹返回 notFound", async () => {
    await expectError(() => call("projects_remove_folder", { projectId: "nope", folderId: "x" }), "notFound");
    const project = call<ProjectNode>("projects_create", { name: "Q" });
    await expectError(
      () => call("projects_remove_folder", { projectId: project.id, folderId: "nope" }),
      "notFound",
      "文件夹不存在",
    );
  });

  it("移除文件夹与删除项目", () => {
    const project = call<ProjectNode>("projects_create", { name: "R" });
    const folder = call<FolderNode>("projects_add_folder", {
      projectId: project.id,
      path: "/Users/demo/code/apps",
    });
    call("projects_remove_folder", { projectId: project.id, folderId: folder.id });
    expect(call<ProjectNode[]>("projects_list", {}).find((item) => item.id === project.id)?.folders).toEqual([]);

    call("projects_delete", { projectId: project.id });
    expect(call<ProjectNode[]>("projects_list", {}).some((item) => item.id === project.id)).toBe(false);
  });

  it("目录选择框依次返回示例路径", () => {
    const handler = projectsMock["plugin:dialog|open"];
    const first = handler({});
    const second = handler({});
    expect(first).toBe("/Users/demo/code/website");
    expect(second).toBe("/Users/demo/code/tools");
  });
});
