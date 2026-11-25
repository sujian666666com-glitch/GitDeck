/**
 * 下拉菜单与右键菜单（Radix），统一样式。用法：
 *
 *   <Menu>
 *     <MenuTrigger asChild><IconButton label="更多" noTip>…</IconButton></MenuTrigger>
 *     <MenuContent align="end">
 *       <MenuItem icon={<GitBranch />} onSelect={…}>创建分支</MenuItem>
 *       <MenuSeparator />
 *       <MenuItem danger icon={<Trash2 />}>删除</MenuItem>
 *     </MenuContent>
 *   </Menu>
 *
 *   <ContextMenu>
 *     <ContextMenuTrigger asChild><div>行</div></ContextMenuTrigger>
 *     <ContextMenuContent>…<ContextMenuItem>…</ContextMenuItem></ContextMenuContent>
 *   </ContextMenu>
 */
import { Check, ChevronRight } from "lucide-react";
import { ContextMenu as CM, DropdownMenu as DM } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const panel =
  "z-50 min-w-[188px] max-w-[320px] overflow-hidden rounded-[10px] border border-line bg-surface p-1 text-[13px] text-ink shadow-pop outline-none";
const item =
  "relative flex h-7 select-none items-center gap-2 rounded-md px-2 outline-none data-[highlighted]:bg-subtle data-[disabled]:pointer-events-none data-[disabled]:opacity-40";
const dangerItem = "text-st-deleted data-[highlighted]:bg-st-deleted-bg [&_svg]:text-st-deleted";

interface ItemExtras {
  icon?: ReactNode;
  danger?: boolean;
  /** 右侧弱化的快捷键或补充说明 */
  hint?: string;
}

function ItemBody({ icon, hint, children }: { icon?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <>
      {icon !== undefined && (
        <span className="flex size-4 shrink-0 items-center justify-center text-muted [&_svg]:size-[15px]">{icon}</span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="ml-3 shrink-0 text-[11px] text-muted">{hint}</span>}
    </>
  );
}

/* ───────── 下拉菜单 ───────── */

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;
export const MenuRadioGroup = DM.RadioGroup;
export const MenuSub = DM.Sub;

export function MenuContent({ className, sideOffset = 6, align = "start", ...props }: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={sideOffset} align={align} collisionPadding={8} className={cn(panel, className)} {...props} />
    </DM.Portal>
  );
}

export function MenuItem({ className, icon, danger, hint, children, ...props }: ComponentProps<typeof DM.Item> & ItemExtras) {
  return (
    <DM.Item className={cn(item, danger && dangerItem, className)} {...props}>
      <ItemBody icon={icon} hint={hint}>
        {children}
      </ItemBody>
    </DM.Item>
  );
}

export function MenuRadioItem({ className, children, ...props }: ComponentProps<typeof DM.RadioItem>) {
  return (
    <DM.RadioItem className={cn(item, "pl-7", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DM.ItemIndicator>
          <Check className="size-[14px] text-accent" />
        </DM.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DM.RadioItem>
  );
}

export function MenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem className={cn(item, "pl-7", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DM.ItemIndicator>
          <Check className="size-[14px] text-accent" />
        </DM.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DM.CheckboxItem>
  );
}

export function MenuSubTrigger({ className, icon, children, ...props }: ComponentProps<typeof DM.SubTrigger> & { icon?: ReactNode }) {
  return (
    <DM.SubTrigger className={cn(item, "data-[state=open]:bg-subtle", className)} {...props}>
      <ItemBody icon={icon}>{children}</ItemBody>
      <ChevronRight className="size-[14px] text-muted" />
    </DM.SubTrigger>
  );
}

export function MenuSubContent({ className, ...props }: ComponentProps<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent sideOffset={4} collisionPadding={8} className={cn(panel, className)} {...props} />
    </DM.Portal>
  );
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted", className)} {...props} />;
}

/* ───────── 右键菜单 ───────── */

export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;
export const ContextMenuGroup = CM.Group;

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof CM.Content>) {
  return (
    <CM.Portal>
      <CM.Content collisionPadding={8} className={cn(panel, className)} {...props} />
    </CM.Portal>
  );
}

export function ContextMenuItem({ className, icon, danger, hint, children, ...props }: ComponentProps<typeof CM.Item> & ItemExtras) {
  return (
    <CM.Item className={cn(item, danger && dangerItem, className)} {...props}>
      <ItemBody icon={icon} hint={hint}>
        {children}
      </ItemBody>
    </CM.Item>
  );
}

export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof CM.Separator>) {
  return <CM.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}

export function ContextMenuLabel({ className, ...props }: ComponentProps<typeof CM.Label>) {
  return <CM.Label className={cn("px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted", className)} {...props} />;
}
