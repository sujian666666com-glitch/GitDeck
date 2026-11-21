import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Tip } from "./tooltip";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:bg-subtle disabled:text-muted",
  secondary: "bg-subtle text-ink hover:bg-hover disabled:text-faint disabled:hover:bg-subtle",
  ghost: "text-ink-2 hover:bg-subtle disabled:text-faint disabled:hover:bg-transparent",
  outline: "border border-line-strong bg-surface text-ink hover:bg-subtle disabled:text-faint",
  danger: "bg-st-deleted text-white hover:opacity-90 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-7 gap-1 rounded-lg px-2.5 text-[12px]",
  md: "h-8 gap-1.5 rounded-[10px] px-3 text-[13px]",
  lg: "h-10 gap-2 rounded-card px-4 text-[14px]",
};

export type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-focus/60 disabled:cursor-not-allowed",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export type IconButtonProps = ComponentProps<"button"> & {
  /** 无障碍名称，同时作为悬停提示 */
  label: string;
  size?: "sm" | "md";
  /** 不显示悬停提示（例如已在菜单触发器上） */
  noTip?: boolean;
};

/** 方形图标按钮，默认带悬停提示 */
export function IconButton({ label, size = "md", noTip, className, type = "button", children, ...props }: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors",
        "hover:bg-subtle hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus/60",
        "disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent",
        size === "sm" ? "size-6 [&_svg]:size-[14px]" : "size-7 [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
  return noTip ? button : <Tip content={label}>{button}</Tip>;
}
