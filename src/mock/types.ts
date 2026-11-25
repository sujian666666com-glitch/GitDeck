/**
 * 浏览器预览用的命令模拟：命令名 → 处理函数（参数为前端传入的 camelCase 对象）。
 * 抛出 `{ kind, message }` 可模拟后端错误。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockHandlers = Record<string, (args: any) => unknown>;

/** 模拟后端错误 */
export function mockError(kind: string, message: string): never {
  throw { kind, message };
}
