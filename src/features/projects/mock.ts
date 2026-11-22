import { mockError, type MockHandlers } from "@/mock/types";
import type { FolderNode, ProjectNode, RepoNode } from "./types";

/** 项目名最大长度（与 `MAX_PROJECT_NAME_LENGTH` 一致） */
const MAX_NAME_CHARS = 64;

/**
 * 浏览器预览用的「假磁盘」：文件夹绝对路径 → 其中的 Git 仓库。
 * 未列出的路径视为「存在但没有仓库」，与真实后端扫描空文件夹的行为一致。
 */
const MOCK_DIRS: Record<string, { isRepo?: boolean; repos?: RepoNode[]; truncated?: boolean }> = {
  "/Users/demo/code/backend": {
    repos: [
      { path: "/Users/demo/code/backend/casdoor", name: "casdoor" },
      { path: "/Users/demo/code/backend/casdoor-sso", name: "casdoor-sso" },
    ],
  },
  "/Users/demo/code/apps": {
    repos: [
      { path: "/Users/demo/code/apps/agentflow", name: "agentflow" },
      { path: "/Users/demo/code/apps/agentdock", name: "agentdock" },
    ],
  },
  "/Users/demo/code/website": {
    repos: [
      { path: "/Users/demo/code/website/docs", name: "docs" },
      { path: "/Users/demo/code/website/landing", name: "landing" },
    ],
  },
  "/Users/demo/code/tools": {
    isRepo: true,
    repos: [{ path: "/Users/demo/code/tools", name: "tools" }],
  },
  // 超过访问预算的演示目录：只返回部分结果
  "/Users/demo/code/monorepo": {
    truncated: true,
    repos: [
      { path: "/Users/demo/code/monorepo/apps/admin", name: "apps/admin" },
      { path: "/Users/demo/code/monorepo/apps/web", name: "apps/web" },
    ],
  },
};

/** 模拟 `projects_list` 的扫描结果 */
function scanFolder(path: string): { isRepo: boolean; repos: RepoNode[]; truncated: boolean } {
  const entry = MOCK_DIRS[path];
  if (!entry) return { isRepo: false, repos: [], truncated: false };
  return { isRepo: entry.isRepo ?? false, repos: entry.repos ?? [], truncated: entry.truncated ?? false };
}

function folderNode(id: string, path: string): FolderNode {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  const { isRepo, repos, truncated } = scanFolder(path);
  return { id, path, name, exists: true, isRepo, repos, truncated };
}

/** 浏览器预览数据：对照原型的 AgentFlow / SWClaw */
let projects: ProjectNode[] = [
  {
    id: "p-agentflow",
    name: "AgentFlow",
    folders: [
      folderNode("f-backend", "/Users/demo/code/backend"),
      folderNode("f-apps", "/Users/demo/code/apps"),
    ],
  },
  { id: "p-swclaw", name: "SWClaw", folders: [] },
];

/** 模拟系统目录选择框依次返回的路径，便于预览各种状态 */
const PICKABLE_DIRS = [
  "/Users/demo/code/website",
  "/Users/demo/code/tools",
  "/Users/demo/code/gitdeck",
  "/Users/demo/code/monorepo",
];
let pickIndex = 0;

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validateName(raw: string): string {
  const name = raw.trim();
  if (!name) mockError("invalid", "项目名称不能为空");
  if ([...name].length > MAX_NAME_CHARS) mockError("invalid", `项目名称不能超过 ${MAX_NAME_CHARS} 个字符`);
  return name;
}

function findProject(projectId: string): ProjectNode {
  return projects.find((project) => project.id === projectId) ?? mockError("notFound", "项目不存在");
}

/** 去掉末尾分隔符，用于比较是否同一路径（真实后端会规范化路径） */
function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
}

export const projectsMock: MockHandlers = {
  projects_list: () => clone(projects),

  projects_create: ({ name }: { name: string }) => {
    const project: ProjectNode = { id: nextId("p"), name: validateName(name), folders: [] };
    projects = [...projects, project];
    return clone(project);
  },

  projects_rename: ({ projectId, name }: { projectId: string; name: string }) => {
    const project = findProject(projectId);
    project.name = validateName(name);
    return clone(project);
  },

  projects_delete: ({ projectId }: { projectId: string }) => {
    findProject(projectId);
    projects = projects.filter((project) => project.id !== projectId);
    return null;
  },

  projects_add_folder: ({ projectId, path }: { projectId: string; path: string }) => {
    const project = findProject(projectId);
    // 与真实后端一致：不 trim 路径（目录名可以以空格结尾），只做空值校验
    if (!path) mockError("invalid", "请选择一个文件夹");
    const target = normalizePath(path);
    if (project.folders.some((folder) => normalizePath(folder.path) === target)) {
      mockError("invalid", "该文件夹已在项目中");
    }
    const folder = folderNode(nextId("f"), target);
    project.folders.push(folder);
    return clone(folder);
  },

  projects_remove_folder: ({ projectId, folderId }: { projectId: string; folderId: string }) => {
    const project = findProject(projectId);
    if (!project.folders.some((folder) => folder.id === folderId)) mockError("notFound", "文件夹不存在");
    project.folders = project.folders.filter((folder) => folder.id !== folderId);
    return null;
  },

  // 覆盖 src/mock/index.ts 里的默认实现：依次返回示例目录，方便预览「添加文件夹」
  "plugin:dialog|open": () => {
    const path = PICKABLE_DIRS[pickIndex % PICKABLE_DIRS.length];
    pickIndex += 1;
    return path;
  },
};
