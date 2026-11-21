# GitDeck

一款参考 Cursor Git Graph 的极简桌面 Git 管理工具，支持 macOS / Windows，聚焦操作简单、界面精致、多仓库统一管理。

## 文档

- [产品设计文档](docs/product-design.md) — 产品定位、核心功能、技术方案与开发顺序
- [界面设计说明](docs/ui-design.md) — 三张界面原型的转写与交互说明

## 核心模块

- **项目管理** — 项目 / 文件夹 / 仓库三级结构，自动识别仓库，多仓库快速切换，配置本地保存
- **Git Graph** — 提交历史、分支与合并关系可视化；分支 / Tag 引用标签（Refs）、分支筛选与创建 / 切换 / 合并 / 删除；查看提交 Diff
- **Changes** — 文件变更列表、Diff、暂存与提交；Cursor 风格的提交下拉（提交 / 提交（修改）/ 提交和推送 / 提交和同步）

## 技术栈

| 模块 | 技术 |
|---|---|
| 桌面端 | Tauri 2 |
| 前端 | React + TypeScript |
| UI | Tailwind CSS + Lucide |
| Git | Git CLI |
| 图谱 | SVG + 虚拟列表 |
| 本地配置 | JSON |
