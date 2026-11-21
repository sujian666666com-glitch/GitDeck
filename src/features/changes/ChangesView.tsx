import { FileDiff } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";

export interface ChangesViewProps {
  /** 仓库根目录绝对路径 */
  repoPath: string;
  /** 当前是否为可见 Tab */
  active: boolean;
}

/** Changes 视图。脚手架占位：由 Changes 模块实现 */
export function ChangesView(_props: ChangesViewProps) {
  return <EmptyState className="flex-1" icon={<FileDiff />} title="Changes" description="变更与提交模块开发中" />;
}
