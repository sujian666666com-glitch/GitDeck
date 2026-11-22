/** 与 `src-tauri/src/projects/types.rs` 对应 */

export interface ProjectNode {
  id: string;
  name: string;
  folders: FolderNode[];
}

export interface FolderNode {
  id: string;
  /** 绝对路径 */
  path: string;
  /** 目录名 */
  name: string;
  /** 目录当前是否存在 */
  exists: boolean;
  /** 文件夹本身就是仓库 */
  isRepo: boolean;
  /** 识别到的仓库；isRepo 时只含自身 */
  repos: RepoNode[];
  /** 扫描因访问预算用尽提前结束，repos 只是部分结果 */
  truncated: boolean;
}

export interface RepoNode {
  /** 仓库根目录绝对路径（全应用唯一标识） */
  path: string;
  /** 相对所属文件夹的显示名，如 casdoor、services/auth */
  name: string;
}
