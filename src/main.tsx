import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { inTauri } from "@/lib/runtime";
import "@/styles.css";

async function bootstrap() {
  if (!inTauri && import.meta.env.DEV) {
    // 浏览器预览：`pnpm dev` 后打开 http://localhost:1420，用 mock 数据代替 Tauri 后端
    const { installMocks } = await import("@/mock");
    installMocks();
  }

  if (!import.meta.env.DEV) {
    // 发布版屏蔽 WebView 默认右键菜单（刷新 / 检查元素）；输入框保留
    document.addEventListener("contextmenu", (event) => {
      if (!(event.target as HTMLElement | null)?.closest("input, textarea")) event.preventDefault();
    });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
