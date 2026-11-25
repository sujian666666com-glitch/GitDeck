import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** 浅灰胶囊标签（原型：头部项目名） */
export function Pill({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-[200px] items-center truncate rounded-full bg-subtle px-2.5 text-[12px] text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

/** 圆形计数徽标（原型：「更改」右侧的数量） */
export function CountBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-subtle px-1.5 text-[11px] font-medium text-ink-2 tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
