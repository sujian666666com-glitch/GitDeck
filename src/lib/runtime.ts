/** 是否运行在 Tauri 宿主中（模块加载时求值，早于浏览器 mock 的安装） */
export const inTauri: boolean = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** macOS：窗口使用 Overlay 标题栏，顶部需要给红绿灯留出拖拽区 */
export const isMac: boolean =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** 快捷键修饰键：macOS 用 ⌘，其他平台用 Ctrl */
export function isModKey(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}
