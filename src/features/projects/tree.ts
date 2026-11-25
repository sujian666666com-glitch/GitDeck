/**
 * 项目树的纯逻辑：展开状态（localStorage）、树扁平化、选中仓库查找与校准。
 * 与渲染无关，便于单测。
 */
import type { RepoSelection } from "@/app/AppState";
import type { FolderNode, ProjectNode, RepoNode } from "./types";

/** 展开状态保存位置：projectId / folderId 的数组 */
export const EXPANDED_STORAGE_KEY = "gitdeck.projects.expanded";

/** 扁平化后的一行 */
export type TreeRow =
  | { kind: "project"; key: string; depth: 0; project: ProjectNode }
  | { kind: "folder"; key: string; depth: 1; project: ProjectNode; folder: FolderNode }
  | { kind: "repo"; key: string; depth: 2; project: ProjectNode; folder: FolderNode; repo: RepoNode }
  /** 项目下还没有文件夹：一行弱化的「添加文件夹」入口 */
  | { kind: "empty-folder"; key: string; depth: 1; project: ProjectNode }
  /** 文件夹里没有识别到仓库 */
  | { kind: "no-repos"; key: string; depth: 2; project: ProjectNode; folder: FolderNode };

/** 树中所有可展开节点的 ID（项目 + 文件夹） */
export function collectNodeIds(projects: readonly ProjectNode[]): string[] {
  const ids: string[] = [];
  for (const project of projects) {
    ids.push(project.id);
    for (const folder of project.folders) ids.push(folder.id);
  }
  return ids;
}

/** 去掉已经不存在于树中的 ID，保持原有顺序 */
export function pruneExpanded(expanded: readonly string[], projects: readonly ProjectNode[]): string[] {
  const alive = new Set(collectNodeIds(projects));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of expanded) {
    if (!alive.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** 切换某个节点的展开状态（返回新数组，id 位置保持稳定） */
export function toggleExpanded(expanded: readonly string[], id: string): string[] {
  return expanded.includes(id) ? expanded.filter((item) => item !== id) : [...expanded, id];
}

/** 把节点标记为展开（已展开时原样返回） */
export function expandNode(expanded: readonly string[], id: string): string[] {
  return expanded.includes(id) ? [...expanded] : [...expanded, id];
}

/**
 * 扁平化树。未出现在 `expanded` 中的项目 / 文件夹视为收起。
 * 顺序：项目 → 文件夹 → 仓库，与配置顺序一致。
 */
export function flattenProjects(projects: readonly ProjectNode[], expanded: readonly string[]): TreeRow[] {
  const open = new Set(expanded);
  const rows: TreeRow[] = [];

  for (const project of projects) {
    rows.push({ kind: "project", key: `p:${project.id}`, depth: 0, project });
    if (!open.has(project.id)) continue;

    if (project.folders.length === 0) {
      rows.push({ kind: "empty-folder", key: `e:${project.id}`, depth: 1, project });
      continue;
    }

    for (const folder of project.folders) {
      const folderKey = `${project.id}:${folder.id}`;
      rows.push({ kind: "folder", key: `f:${folderKey}`, depth: 1, project, folder });
      if (!open.has(folder.id) || !folder.exists) continue;

      if (folder.repos.length === 0) {
        rows.push({ kind: "no-repos", key: `n:${folderKey}`, depth: 2, project, folder });
        continue;
      }
      for (const repo of folder.repos) {
        // 同一个仓库可能被添加到不同项目，行 key 需要带上所属项目 / 文件夹
        rows.push({ kind: "repo", key: `r:${folderKey}:${repo.path}`, depth: 2, project, folder, repo });
      }
    }
  }

  return rows;
}

export interface RepoLocation {
  project: ProjectNode;
  folder: FolderNode;
  repo: RepoNode;
}

/** 在整棵树中按路径查找仓库（同一仓库可能出现在多个项目中，返回第一个） */
export function findRepo(projects: readonly ProjectNode[], repoPath: string): RepoLocation | null {
  for (const project of projects) {
    for (const folder of project.folders) {
      for (const repo of folder.repos) {
        if (repo.path === repoPath) return { project, folder, repo };
      }
    }
  }
  return null;
}

/** 在指定项目内按路径查找仓库 */
export function findRepoIn(
  projects: readonly ProjectNode[],
  projectId: string,
  repoPath: string,
): RepoLocation | null {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return null;
  for (const folder of project.folders) {
    for (const repo of folder.repos) {
      if (repo.path === repoPath) return { project, folder, repo };
    }
  }
  return null;
}

/** 两个选中记录是否指向同一项目下的同一仓库 */
export function sameSelection(a: RepoSelection | null, b: RepoSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.repoPath === b.repoPath &&
    a.projectId === b.projectId &&
    a.repoName === b.repoName &&
    a.projectName === b.projectName
  );
}

/**
 * 用新树校准当前选中：
 * 1. 优先按（projectId, repoPath）匹配，命中时同步项目 / 仓库的显示名（项目重命名）；
 * 2. 原项目消失但同一路径的仓库仍在其他项目中时，切换为那个项目；
 * 3. 所有位置都消失时返回 null（调用方据此清空选中）。
 */
export function reconcileSelection(
  projects: readonly ProjectNode[],
  selection: RepoSelection | null,
): RepoSelection | null {
  if (!selection) return null;

  const current = findRepoIn(projects, selection.projectId, selection.repoPath);
  const found = current ?? findRepo(projects, selection.repoPath);
  if (!found) return null;

  const next: RepoSelection = {
    repoPath: found.repo.path,
    repoName: found.repo.name,
    projectId: found.project.id,
    projectName: found.project.name,
  };
  // 字段完全一致时返回原对象，避免无意义的重渲染
  return sameSelection(next, selection) ? selection : next;
}

/** 读取展开状态；从未保存过（首次启动）返回 null */
export function loadExpanded(): string[] | null {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

export function saveExpanded(expanded: readonly string[]): void {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded));
  } catch {
    // 隐私模式等场景下写入失败：忽略，本次会话内仍然生效
  }
}
