import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// 默认 node 环境；需要 DOM 的测试文件在首行写 `// @vitest-environment jsdom`
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
