import { mockIPC } from "@tauri-apps/api/mocks";
import { changesMock } from "@/features/changes/mock";
import { graphMock } from "@/features/graph/mock";
import { projectsMock } from "@/features/projects/mock";
import type { MockHandlers } from "./types";

const shared: MockHandlers = {
  // 浏览器里没有原生目录选择框，返回一个示例路径
  "plugin:dialog|open": () => "/Users/demo/code/tools",
};

/** 在浏览器中用 mock 数据代替 Tauri 后端（仅 `pnpm dev` 且不在 Tauri 中时启用） */
export function installMocks(): void {
  const handlers: MockHandlers = { ...shared, ...projectsMock, ...graphMock, ...changesMock };
  mockIPC(async (command, payload) => {
    await new Promise((resolve) => setTimeout(resolve, 60 + Math.random() * 140));
    const handler = handlers[command];
    if (!handler) throw { kind: "notImplemented", message: `浏览器预览尚未模拟命令：${command}` };
    return handler(payload ?? {});
  });
  console.info("[GitDeck] 浏览器预览模式：后端命令由 src/mock 模拟");
}
