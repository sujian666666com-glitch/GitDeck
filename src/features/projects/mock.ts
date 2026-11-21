import { mockError, type MockHandlers } from "@/mock/types";
import type { FolderNode, ProjectNode } from "./types";

/** 浏览器预览数据：对照原型的 AgentFlow / SWClaw */
let projects: ProjectNode[] = [
  {
    id: "p-agentflow",
    name: "AgentFlow",
    folders: [
      {
        id: "f-backend",
        path: "/Users/demo/code/backend",
        name: "backend",
        exists: true,
        isRepo: false,
        repos: [
          { path: "/Users/demo/code/backend/casdoor", name: "casdoor" },
          { path: "/Users/demo/code/backend/casdoor-sso", name: "casdoor-sso" },
        ],
      },
      {
        id: "f-apps",
        path: "/Users/demo/code/apps",
        name: "apps",
        exists: true,
        isRepo: false,
        repos: [
          { path: "/Users/demo/code/apps/agentflow", name: "agentflow" },
          { path: "/Users/demo/code/apps/agentdock", name: "agentdock" },
        ],
      },
    ],
  },
  { id: "p-swclaw", name: "SWClaw", folders: [] },
];

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`;

function findProject(projectId: string): ProjectNode {
  return projects.find((p) => p.id === projectId) ?? mockError("notFound", "项目不存在");
}

export const projectsMock: MockHandlers = {
  projects_list: () => structuredClone(projects),

  projects_create: ({ name }: { name: string }) => {
    if (!name.trim()) mockError("invalid", "项目名称不能为空");
    const project: ProjectNode = { id: nextId("p"), name: name.trim(), folders: [] };
    projects = [...projects, project];
    return structuredClone(project);
  },

  projects_rename: ({ projectId, name }: { projectId: string; name: string }) => {
    const project = findProject(projectId);
    project.name = name.trim();
    return structuredClone(project);
  },

  projects_delete: ({ projectId }: { projectId: string }) => {
    projects = projects.filter((p) => p.id !== projectId);
    return null;
  },

  projects_add_folder: ({ projectId, path }: { projectId: string; path: string }) => {
    const project = findProject(projectId);
    if (project.folders.some((f) => f.path === path)) mockError("invalid", "该文件夹已在项目中");
    const name = path.split("/").filter(Boolean).pop() ?? path;
    const folder: FolderNode = {
      id: nextId("f"),
      path,
      name,
      exists: true,
      isRepo: false,
      repos: [
        { path: `${path}/cli`, name: "cli" },
        { path: `${path}/web`, name: "web" },
      ],
    };
    project.folders.push(folder);
    return structuredClone(folder);
  },

  projects_remove_folder: ({ projectId, folderId }: { projectId: string; folderId: string }) => {
    const project = findProject(projectId);
    project.folders = project.folders.filter((f) => f.id !== folderId);
    return null;
  },
};
