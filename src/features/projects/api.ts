import { call } from "@/lib/tauri";
import type { FolderNode, ProjectNode } from "./types";

/** 项目管理后端命令（`src-tauri/src/projects/commands.rs`） */
export const projectsApi = {
  list: () => call<ProjectNode[]>("projects_list"),
  create: (name: string) => call<ProjectNode>("projects_create", { name }),
  rename: (projectId: string, name: string) => call<ProjectNode>("projects_rename", { projectId, name }),
  remove: (projectId: string) => call<void>("projects_delete", { projectId }),
  addFolder: (projectId: string, path: string) => call<FolderNode>("projects_add_folder", { projectId, path }),
  removeFolder: (projectId: string, folderId: string) => call<void>("projects_remove_folder", { projectId, folderId }),
};
