import { FolderKanban, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppState } from "@/app/AppState";
import { cn } from "@/lib/cn";
import { toAppError } from "@/lib/tauri";
import { projectsApi } from "./api";
import type { ProjectNode } from "./types";

/**
 * 侧边栏「项目」区。
 * 脚手架占位：仅平铺列出仓库用于验证布局；项目 / 文件夹 / 仓库三级树与增删改由项目管理模块实现。
 */
export function ProjectsPanel() {
  const { selection, selectRepo } = useAppState();
  const [projects, setProjects] = useState<ProjectNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    projectsApi
      .list()
      .then(setProjects)
      .catch((err) => setError(toAppError(err).message));
  }, []);

  return (
    <section className="px-2 py-3">
      <div className="flex h-8 items-center gap-2 px-2 text-[14px] font-semibold text-ink">
        <FolderKanban className="size-4" />
        项目
      </div>
      {error && <p className="px-2 py-4 text-[12px] text-muted">{error}</p>}
      {projects.map((project) =>
        project.folders.flatMap((folder) =>
          folder.repos.map((repo) => (
            <button
              key={repo.path}
              type="button"
              onClick={() =>
                selectRepo({
                  repoPath: repo.path,
                  repoName: repo.name,
                  projectId: project.id,
                  projectName: project.name,
                })
              }
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] text-ink hover:bg-subtle",
                selection?.repoPath === repo.path && "bg-accent-soft",
              )}
            >
              <GitBranch className="size-4 shrink-0 text-accent" />
              <span className="truncate">{repo.name}</span>
            </button>
          )),
        ),
      )}
    </section>
  );
}
