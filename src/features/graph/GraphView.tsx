import { GitGraph } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";

export interface GraphViewProps {
  /** 仓库根目录绝对路径 */
  repoPath: string;
  /** 当前是否为可见 Tab（不可见时可暂停加载） */
  active: boolean;
}

/** Git Graph 视图。脚手架占位：由 Git Graph 模块实现 */
export function GraphView(_props: GraphViewProps) {
  return <EmptyState className="flex-1" icon={<GitGraph />} title="Git Graph" description="提交图谱模块开发中" />;
}
