import {
  Copy,
  Folder,
  FolderKanban,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useAppState } from "@/app/AppState";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { flattenProjects, type TreeRow } from "./tree";
import type { FolderNode, ProjectNode, RepoNode } from "./types";
import { useProjects, type ProjectsController } from "./useProjects";

/**
 * 侧边栏「项目」区：项目 / 文件夹 / Git 仓库三级树。
 * 数据与操作见 `useProjects`，展开状态保存在 localStorage（默认全部展开）。
 * 每行都有右键菜单与悬停 / 聚焦时出现的「更多操作」按钮，两者内容一致。
 */
export function ProjectsPanel() {
  const { selection } = useAppState();
  const projects = useProjects();
  const rows = useMemo(
    () => flattenProjects(projects.projects, projects.expanded),
    [projects.projects, projects.expanded],
  );

  return (
    <section className="px-2 py-3">
      <div className="flex h-8 items-center gap-2 pr-1 pl-2">
        <FolderKanban className="size-4 shrink-0 text-ink-2" />
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">项目</h2>
        <IconButton label="新建项目" size="sm" onClick={() => void projects.createProject()}>
          <Plus />
        </IconButton>
      </div>

      {projects.loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : projects.error ? (
        <div className="px-3 py-6 text-center">
          <p className="text-[12px] leading-relaxed text-muted">{projects.error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void projects.reload()}>
            重试
          </Button>
        </div>
      ) : projects.projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="还没有项目"
          description="创建项目并添加文件夹，GitDeck 会自动识别其中的 Git 仓库。"
          action={
            <Button size="sm" variant="primary" onClick={() => void projects.createProject()}>
              <Plus />
              新建项目
            </Button>
          }
        />
      ) : (
        <div className="mt-1">
          {rows.map((row) => (
            <TreeRowView
              key={row.key}
              row={row}
              projects={projects}
              selectedProjectId={selection?.projectId ?? null}
              selectedRepoPath={selection?.repoPath ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const INDENT = 16;
const BASE_PADDING = 6;

/** 行菜单项：右键菜单与「更多操作」下拉共用同一份内容 */
type RowMenuEntry =
  | { type: "separator" }
  | { type: "item"; key: string; label: string; icon: ReactNode; danger?: boolean; onSelect: () => void };

interface RowShellProps {
  depth: number;
  icon: ReactNode;
  label: string;
  /** 悬停提示（完整路径等） */
  title?: string;
  /** 行尾弱化说明 */
  hint?: string;
  selected?: boolean;
  muted?: boolean;
  labelClassName?: string;
  onClick?: () => void;
  /** 可展开行的展开状态，供读屏软件播报 */
  ariaExpanded?: boolean;
  menu?: RowMenuEntry[];
}

/** 一行：图标 + 名称 + 悬停操作按钮 + 右键菜单 */
function RowShell({
  depth,
  icon,
  label,
  title,
  hint,
  selected,
  muted,
  labelClassName,
  onClick,
  ariaExpanded,
  menu,
}: RowShellProps) {
  const body = (
    <>
      <span className={cn("flex size-4 shrink-0 items-center justify-center", muted && "opacity-70")}>{icon}</span>
      <span className={cn("truncate text-[13px]", labelClassName)}>{label}</span>
      {hint && <span className="ml-auto shrink-0 pl-1 text-[11px] text-faint">{hint}</span>}
    </>
  );

  const hasMenu = Boolean(menu && menu.length > 0);

  const content = (
    <div
      className={cn(
        "group flex h-[30px] items-center gap-1 rounded-lg pr-1.5 transition-colors",
        selected ? "bg-accent-soft" : "hover:bg-subtle",
      )}
      style={{ paddingLeft: BASE_PADDING + depth * INDENT }}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          title={title}
          aria-expanded={ariaExpanded}
          aria-current={selected ? "true" : undefined}
          className={cn(
            "flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-focus/60",
            muted ? "text-muted" : "text-ink",
          )}
        >
          {body}
        </button>
      ) : (
        <div
          title={title}
          className={cn("flex h-full min-w-0 flex-1 items-center gap-2", muted ? "text-muted" : "text-ink")}
        >
          {body}
        </div>
      )}

      {hasMenu && (
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              label="更多操作"
              size="sm"
              noTip
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            >
              <MoreHorizontal />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end">
            {menu?.map((entry, index) =>
              entry.type === "separator" ? (
                <MenuSeparator key={`sep-${index}`} />
              ) : (
                <MenuItem key={entry.key} icon={entry.icon} danger={entry.danger} onSelect={entry.onSelect}>
                  {entry.label}
                </MenuItem>
              ),
            )}
          </MenuContent>
        </Menu>
      )}
    </div>
  );

  if (!hasMenu) return content;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent>
        {menu?.map((entry, index) =>
          entry.type === "separator" ? (
            <ContextMenuSeparator key={`sep-${index}`} />
          ) : (
            <ContextMenuItem key={entry.key} icon={entry.icon} danger={entry.danger} onSelect={entry.onSelect}>
              {entry.label}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TreeRowView({
  row,
  projects,
  selectedProjectId,
  selectedRepoPath,
}: {
  row: TreeRow;
  projects: ProjectsController;
  selectedProjectId: string | null;
  selectedRepoPath: string | null;
}) {
  switch (row.kind) {
    case "project":
      return <ProjectRow project={row.project} projects={projects} />;
    case "folder":
      return <FolderRow project={row.project} folder={row.folder} projects={projects} />;
    case "repo":
      return (
        <RepoRow
          project={row.project}
          repo={row.repo}
          projects={projects}
          selected={selectedProjectId === row.project.id && selectedRepoPath === row.repo.path}
        />
      );
    case "empty-folder":
      return (
        <RowShell
          depth={row.depth}
          icon={<FolderPlus className="size-[15px] text-muted" />}
          label="添加文件夹"
          muted
          labelClassName="text-[12px]"
          onClick={() => void projects.addFolder(row.project)}
        />
      );
    case "no-repos":
      return (
        <RowShell
          depth={row.depth}
          icon={<GitBranch className="size-[15px] text-faint" />}
          // 扫描被预算截断时，「没发现仓库」不代表真的没有
          label={row.folder.truncated ? "扫描不完整，未发现仓库" : "未发现 Git 仓库"}
          muted
          labelClassName="text-[12px] text-faint"
        />
      );
  }
}

function projectMenu(project: ProjectNode, projects: ProjectsController): RowMenuEntry[] {
  return [
    {
      type: "item",
      key: "add-folder",
      label: "添加文件夹…",
      icon: <FolderPlus />,
      onSelect: () => void projects.addFolder(project),
    },
    {
      type: "item",
      key: "rename",
      label: "重命名…",
      icon: <Pencil />,
      onSelect: () => void projects.renameProject(project),
    },
    { type: "separator" },
    {
      type: "item",
      key: "delete",
      label: "删除项目",
      icon: <Trash2 />,
      danger: true,
      onSelect: () => void projects.deleteProject(project),
    },
  ];
}

function ProjectRow({ project, projects }: { project: ProjectNode; projects: ProjectsController }) {
  return (
    <RowShell
      depth={0}
      icon={<Folder className="size-[15px] text-ink-2" />}
      label={project.name}
      labelClassName="font-semibold"
      ariaExpanded={projects.expanded.includes(project.id)}
      onClick={() => projects.toggle(project.id)}
      menu={projectMenu(project, projects)}
    />
  );
}

function FolderRow({
  project,
  folder,
  projects,
}: {
  project: ProjectNode;
  folder: FolderNode;
  projects: ProjectsController;
}) {
  const open = projects.expanded.includes(folder.id);
  const Icon = open && folder.exists ? FolderOpen : Folder;
  const hint = !folder.exists ? "目录不存在" : folder.truncated ? "仅显示部分结果" : undefined;

  const menu: RowMenuEntry[] = [
    {
      type: "item",
      key: "rescan",
      label: "重新扫描",
      icon: <RefreshCw />,
      onSelect: () => void projects.rescan(),
    },
    { type: "separator" },
    {
      type: "item",
      key: "remove",
      label: "从项目中移除…",
      icon: <FolderMinus />,
      onSelect: () => void projects.removeFolder(project, folder),
    },
  ];

  return (
    <RowShell
      depth={1}
      icon={<Icon className={cn("size-[15px]", folder.exists ? "text-ink-2" : "text-faint")} />}
      label={folder.name}
      title={folder.path}
      hint={hint}
      muted={!folder.exists}
      ariaExpanded={open}
      onClick={() => projects.toggle(folder.id)}
      menu={menu}
    />
  );
}

function RepoRow({
  project,
  repo,
  projects,
  selected,
}: {
  project: ProjectNode;
  repo: RepoNode;
  projects: ProjectsController;
  selected: boolean;
}) {
  const { selectRepo } = useAppState();

  const menu: RowMenuEntry[] = [
    {
      type: "item",
      key: "copy-path",
      label: "复制路径",
      icon: <Copy />,
      onSelect: () => void projects.copyRepoPath(repo.path),
    },
  ];

  return (
    <RowShell
      depth={2}
      icon={<GitBranch className="size-[15px] text-accent" />}
      label={repo.name}
      title={repo.path}
      selected={selected}
      onClick={() =>
        selectRepo({ repoPath: repo.path, repoName: repo.name, projectId: project.id, projectName: project.name })
      }
      menu={menu}
    />
  );
}
