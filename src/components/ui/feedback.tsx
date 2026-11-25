import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-label="加载中" className={cn("size-4 animate-spin text-muted", className)} />;
}

/** 空状态 / 错误状态占位 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-1 text-faint [&_svg]:size-8 [&_svg]:stroke-[1.5]">{icon}</div>}
      <p className="text-[13px] font-medium text-ink-2">{title}</p>
      {description && <p className="max-w-[320px] text-[12px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
