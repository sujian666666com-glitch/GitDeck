import { Tooltip } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

type Side = "top" | "right" | "bottom" | "left";

/**
 * 悬停提示。子元素必须能接收 ref（原生元素或透传 props 的组件）。
 * `content` 为空时直接渲染子元素。
 */
export function Tip({
  content,
  side = "top",
  children,
}: {
  content: ReactNode;
  side?: Side;
  children: ReactElement;
}) {
  if (content === null || content === undefined || content === "") return children;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-[360px] rounded-md bg-ink/90 px-2 py-1 text-[12px] leading-snug break-all text-white shadow-pop"
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
