/**
 * 命令式确认框与输入框，在 App 根部挂载一次 <DialogHost />。
 *
 *   if (await confirmDialog({ title: "删除分支？", description: "…", confirmText: "删除", danger: true })) { … }
 *   const name = await promptDialog({ title: "新建分支", placeholder: "feature/login", validate: (v) => v ? null : "不能为空" });
 */
import { Dialog } from "radix-ui";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

interface BaseOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮为红色 */
  danger?: boolean;
}

export type ConfirmOptions = BaseOptions;

export interface PromptOptions extends BaseOptions {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  /** 返回错误文案表示不合法；返回 null 表示通过 */
  validate?: (value: string) => string | null;
}

type Request =
  | ({ type: "confirm"; resolve: (ok: boolean) => void } & ConfirmOptions)
  | ({ type: "prompt"; resolve: (value: string | null) => void } & PromptOptions);

let current: Request | null = null;
const subscribers = new Set<() => void>();

function setCurrent(next: Request | null) {
  const previous = current;
  current = next;
  // 新弹框顶替旧弹框时，旧的按取消处理
  if (previous && previous !== next) cancel(previous);
  subscribers.forEach((notify) => notify());
}

function cancel(request: Request) {
  if (request.type === "confirm") request.resolve(false);
  else request.resolve(null);
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => setCurrent({ type: "confirm", ...options, resolve }));
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => setCurrent({ type: "prompt", ...options, resolve }));
}

export function DialogHost() {
  const request = useSyncExternalStore(subscribe, () => current);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(request?.type === "prompt" ? (request.defaultValue ?? "") : "");
    setError(null);
  }, [request]);

  const close = () => setCurrent(null);

  const submit = () => {
    if (!request) return;
    if (request.type === "confirm") {
      current = null;
      request.resolve(true);
      setCurrent(null);
      return;
    }
    const trimmed = value.trim();
    const message = request.validate ? request.validate(trimmed) : trimmed ? null : "请输入内容";
    if (message) {
      setError(message);
      return;
    }
    current = null;
    request.resolve(trimmed);
    setCurrent(null);
  };

  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/15" />
        <Dialog.Content
          className="fixed top-[20%] left-1/2 z-50 w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-card border border-line bg-surface p-5 shadow-pop outline-none"
          onOpenAutoFocus={(event) => {
            if (request?.type === "confirm") {
              event.preventDefault();
              (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>("[data-confirm]")?.focus();
            }
          }}
        >
          {request && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Dialog.Title className="text-[15px] font-semibold text-ink">{request.title}</Dialog.Title>
              {request.description ? (
                <Dialog.Description className="mt-1.5 text-[13px] leading-relaxed text-muted select-text">
                  {request.description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{request.title}</Dialog.Description>
              )}

              {request.type === "prompt" && (
                <label className="mt-4 block">
                  {request.label && <span className="mb-1.5 block text-[12px] text-ink-2">{request.label}</span>}
                  <input
                    autoFocus
                    value={value}
                    placeholder={request.placeholder}
                    spellCheck={false}
                    onChange={(event) => {
                      setValue(event.target.value);
                      setError(null);
                    }}
                    className={cn(
                      "h-9 w-full rounded-[10px] border bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint",
                      error ? "border-st-deleted" : "border-line-strong focus:border-accent",
                    )}
                  />
                  {error && <span className="mt-1.5 block text-[12px] text-st-deleted">{error}</span>}
                </label>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>
                  {request.cancelText ?? "取消"}
                </Button>
                <Button data-confirm type="submit" variant={request.danger ? "danger" : "primary"}>
                  {request.confirmText ?? "确定"}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
