import { Toaster as Sonner, toast } from "sonner";
import { toAppError } from "@/lib/tauri";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={16}
      gap={8}
      visibleToasts={4}
      toastOptions={{ style: { borderRadius: 12, fontSize: 13, fontFamily: "var(--font-sans)" } }}
    />
  );
}

/** 操作反馈。错误统一走 notify.error，会把 git 原始输出打印到控制台便于排查 */
export const notify = {
  success(message: string, description?: string) {
    toast.success(message, { description });
  },
  info(message: string, description?: string) {
    toast(message, { description });
  },
  /** `title` 是操作名（如「推送失败」），err 的 message 作为说明；不传 title 时直接显示 err 的 message */
  error(err: unknown, title?: string) {
    const error = toAppError(err);
    toast.error(title ?? error.message, { description: title ? error.message : undefined, duration: 6000 });
    if (error.detail) console.warn(`[GitDeck] ${error.message}\n${error.detail}`);
  },
};
