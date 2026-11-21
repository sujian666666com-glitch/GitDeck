import { confirmDialog, promptDialog } from "@/components/ui/dialog";
import { notify } from "@/components/ui/toast";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "@/app/AppState";
import { toAppError } from "@/lib/tauri";
import { projectsApi } from "./api";
import {
  collectNodeIds,
  expandNode,
  findRepo,
  loadExpanded,
  pruneExpanded,
  saveExpanded,
  toggleExpanded,
} from "./tree";
import type { FolderNode, ProjectNode } from "./types";

/** 项目名最大长度（与后端 `MAX_NAME_CHARS` 一致） */
export const MAX_PROJECT_NAME_LENGTH = 64;

/** promptDialog 的项目名校验：返回错误文案表示不合法 */
export function validateProjectName(value: string): string | null {
  const name = value.trim();
  if (!name) return "项目名称不能为空";
  // 按字符（而非 UTF-16 编码单元）计数，与后端 `chars().count()` 一致
  if ([...name].length > MAX_PROJECT_NAME_LENGTH) return `项目名称不能超过 ${MAX_PROJECT_NAME_LENGTH} 个字符`;
  return null;
}

export interface ProjectsController {
  projects: ProjectNode[];
  /** 首次加载中 */
  loading: boolean;
  /** 读取配置失败时的提示（显示在区头下方） */
  error: string | null;
  expanded: string[];
  reload: () => Promise<void>;
  toggle: (id: string) => void;
  createProject: () => Promise<void>;
  renameProject: (project: ProjectNode) => Promise<void>;
  deleteProject: (project: ProjectNode) => Promise<void>;
  addFolder: (project: ProjectNode) => Promise<void>;
  removeFolder: (project: ProjectNode, folder: FolderNode) => Promise<void>;
  rescan: () => Promise<void>;
  copyRepoPath: (repoPath: string) => Promise<void>;
}

/**
 * 项目树的数据与操作：加载、展开状态持久化、增删改。
 * 渲染见 `ProjectsPanel`。
 */
export function useProjects(): ProjectsController {
  const { selection, selectRepo } = useAppState();
  const [projects, setProjects] = useState<ProjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>(() => loadExpanded() ?? []);

  const projectsRef = useRef(projects);
  const expandedRef = useRef(expanded);
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  /** 展开状态：ref 供事件里读取最新值，同时写入 localStorage */
  const applyExpanded = useCallback((next: string[]) => {
    expandedRef.current = next;
    setExpanded(next);
    saveExpanded(next);
  }, []);

  /** 写入新树：同步裁剪展开状态，并在当前仓库消失时清空选中 */
  const commit = useCallback(
    (list: ProjectNode[]) => {
      projectsRef.current = list;
      setProjects(list);
      applyExpanded(pruneExpanded(expandedRef.current, list));
      const current = selectionRef.current;
      if (current && !findRepo(list, current.repoPath)) selectRepo(null);
    },
    [applyExpanded, selectRepo],
  );

  const reload = useCallback(async () => {
    try {
      const list = await projectsApi.list();
      setError(null);
      // 首次启动（localStorage 里还没有展开状态）默认全部展开
      if (loadExpanded() === null) applyExpanded(collectNodeIds(list));
      commit(list);
    } catch (err) {
      const message = toAppError(err).message;
      setError(message);
      notify.error(err, "读取项目失败");
    } finally {
      setLoading(false);
    }
  }, [applyExpanded, commit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = useCallback(
    (id: string) => {
      applyExpanded(toggleExpanded(expandedRef.current, id));
    },
    [applyExpanded],
  );

  const createProject = useCallback(async () => {
    const name = await promptDialog({
      title: "新建项目",
      label: "项目名称",
      placeholder: "例如 AgentFlow",
      confirmText: "创建",
      validate: validateProjectName,
    });
    if (name === null) return;

    try {
      const project = await projectsApi.create(name);
      // 新建的项目默认展开
      applyExpanded(expandNode(expandedRef.current, project.id));
      commit([...projectsRef.current, project]);
    } catch (err) {
      notify.error(err, "新建项目失败");
    }
  }, [applyExpanded, commit]);

  const renameProject = useCallback(
    async (project: ProjectNode) => {
      const name = await promptDialog({
        title: "重命名项目",
        label: "项目名称",
        defaultValue: project.name,
        confirmText: "保存",
        validate: validateProjectName,
      });
      if (name === null || name === project.name) return;

      try {
        const updated = await projectsApi.rename(project.id, name);
        commit(projectsRef.current.map((item) => (item.id === updated.id ? updated : item)));
        const current = selectionRef.current;
        if (current && current.projectId === updated.id) selectRepo({ ...current, projectName: updated.name });
      } catch (err) {
        notify.error(err, "重命名项目失败");
      }
    },
    [commit, selectRepo],
  );

  const deleteProject = useCallback(
    async (project: ProjectNode) => {
      const ok = await confirmDialog({
        title: `删除项目「${project.name}」？`,
        description: "只从 GitDeck 中移除，磁盘上的文件和仓库不会受到影响。",
        confirmText: "删除",
        danger: true,
      });
      if (!ok) return;

      try {
        await projectsApi.remove(project.id);
        commit(projectsRef.current.filter((item) => item.id !== project.id));
      } catch (err) {
        notify.error(err, "删除项目失败");
      }
    },
    [commit],
  );

  const addFolder = useCallback(
    async (project: ProjectNode) => {
      let picked: string | string[] | null = null;
      try {
        picked = await open({ directory: true, multiple: false, title: "选择文件夹" });
      } catch (err) {
        notify.error(err, "打开文件夹选择框失败");
        return;
      }
      if (typeof picked !== "string") return; // 取消选择

      try {
        const folder = await projectsApi.addFolder(project.id, picked);
        // 识别到仓库时自动展开该文件夹（连同所属项目）
        if (folder.repos.length > 0) {
          applyExpanded(expandNode(expandNode(expandedRef.current, project.id), folder.id));
        }
        commit(
          projectsRef.current.map((item) =>
            item.id === project.id ? { ...item, folders: [...item.folders, folder] } : item,
          ),
        );
      } catch (err) {
        notify.error(err, "添加文件夹失败");
      }
    },
    [applyExpanded, commit],
  );

  const removeFolder = useCallback(
    async (project: ProjectNode, folder: FolderNode) => {
      const ok = await confirmDialog({
        title: `从项目中移除「${folder.name}」？`,
        description: "只从 GitDeck 中移除这个文件夹，磁盘上的文件和仓库不会受到影响。",
        confirmText: "移除",
      });
      if (!ok) return;

      try {
        await projectsApi.removeFolder(project.id, folder.id);
        commit(
          projectsRef.current.map((item) =>
            item.id === project.id
              ? { ...item, folders: item.folders.filter((candidate) => candidate.id !== folder.id) }
              : item,
          ),
        );
      } catch (err) {
        notify.error(err, "移除文件夹失败");
      }
    },
    [commit],
  );

  const rescan = useCallback(async () => {
    try {
      const list = await projectsApi.list();
      commit(list);
    } catch (err) {
      notify.error(err, "重新扫描失败");
    }
  }, [commit]);

  const copyRepoPath = useCallback(async (repoPath: string) => {
    try {
      await navigator.clipboard.writeText(repoPath);
      notify.success("已复制仓库路径");
    } catch (err) {
      notify.error(toAppError(err), "复制路径失败");
    }
  }, []);

  return {
    projects,
    loading,
    error,
    expanded,
    reload,
    toggle,
    createProject,
    renameProject,
    deleteProject,
    addFolder,
    removeFolder,
    rescan,
    copyRepoPath,
  };
}
