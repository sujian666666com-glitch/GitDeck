import { invoke } from "@tauri-apps/api/core";

/** 与 Rust `AppError` 的 kind 对应 */
export type AppErrorKind = "git" | "io" | "invalid" | "notFound" | "config" | "internal" | "notImplemented";

/** 后端错误：message 可直接展示给用户，detail 是完整的 git 输出（用于排查） */
export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly detail?: string;

  constructor(kind: AppErrorKind, message: string, detail?: string) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.detail = detail;
  }
}

const KINDS: readonly string[] = ["git", "io", "invalid", "notFound", "config", "internal", "notImplemented"];

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err && typeof err === "object" && "message" in err) {
    const { kind, message, detail } = err as { kind?: unknown; message?: unknown; detail?: unknown };
    return new AppError(
      typeof kind === "string" && KINDS.includes(kind) ? (kind as AppErrorKind) : "internal",
      String(message),
      typeof detail === "string" ? detail : undefined,
    );
  }
  return new AppError("internal", typeof err === "string" ? err : "发生未知错误");
}

/**
 * 调用后端命令。参数用 camelCase（Tauri 自动对应 Rust 的 snake_case），失败时抛出 AppError。
 * 各模块在自己的 `api.ts` 中封装，不要在组件里直接调用。
 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    throw toAppError(err);
  }
}
