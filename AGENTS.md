# GitDeck 开发约定

面向参与开发的人和编码 Agent。产品与界面需求见 [产品设计](docs/product-design.md)、[界面设计](docs/ui-design.md)。

## 技术栈与常用命令

Tauri 2 · React 19 · TypeScript 7 · Vite 8 · Tailwind CSS 4 · lucide-react · radix-ui · sonner · @tanstack/react-virtual · vitest；包管理用 pnpm。

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 浏览器预览 http://localhost:1420，后端命令由 `src/mock` 模拟 |
| `pnpm tauri dev` | 启动桌面应用 |
| `pnpm typecheck` / `pnpm test` | TypeScript 类型检查 / 前端单测 |
| `pnpm test:rust` / `pnpm lint:rust` | Rust 测试 / clippy（`-D warnings`） |
| `pnpm check` | 以上四项全部执行 |
| `pnpm tauri build --debug` | 打包调试版应用 |

## 目录与模块边界

```
src/
  app/              应用外壳：AppState（选中仓库、当前视图）、Shell（双栏）、RepoView（头部 + Tab）
  components/ui/    共享组件：Button / IconButton、Menu / ContextMenu、Popover、Tip、
                    confirmDialog / promptDialog、notify、Spinner / EmptyState、Pill / CountBadge
  components/diff/  DiffViewer（Graph 与 Changes 共用）
  lib/              call() 与 AppError、事件总线、parseUnifiedDiff、format、cn、runtime
  mock/             浏览器预览的命令路由（各模块的 mock.ts 在 features 下）
  features/projects/  项目管理：侧边栏项目 / 文件夹 / 仓库树
  features/graph/     Git Graph：提交图谱、Refs、分支操作、提交详情
  features/changes/   Changes：变更、Diff、暂存、提交；头部 SyncActions（Fetch / Pull / Push）
src-tauri/src/
  lib.rs            命令注册，按模块分段
  error.rs          AppError / AppResult / blocking()
  git/              runner（git CLI 调用）、diff（FileDiff）、testutil（测试用 TempRepo）
  projects/ graph/ changes/   各模块：types.rs 为前后端契约，commands.rs 为命令入口，其余文件自定
```

- 每个业务模块独占 `src/features/<模块>/` 和 `src-tauri/src/<模块>/`。
- 共享层（`app/`、`components/`、`lib/`、`mock/index.ts`、`git/`、`error.rs`、`lib.rs`、各类配置文件）保持稳定；模块开发不改共享层，确需改动时在交付说明里提出。唯一例外：`lib.rs` 中本模块那一段可以增删命令。
- 不随意新增依赖；确有必要时说明理由。

## 前后端契约

- 命令名 `<模块>_<动作>`；Rust 参数 snake_case，前端传 camelCase（Tauri 自动对应）；结构体 `#[serde(rename_all = "camelCase")]`，`Option` 对应 `null`。
- 修改 `types.rs` 时同步本模块的 `types.ts`、`api.ts`、`mock.ts`。
- 命令一律 `async fn`；git 调用、文件扫描等阻塞工作放进 `crate::error::blocking(move || …)`，不能卡住主线程。
- 返回 `AppResult<T>`；`AppError` 的 message 是给用户看的中文短句，git 原始输出放在 `AppError::Git` 的 detail。

## 调用 git

- 只通过 `crate::git::git(repo).args([...]).run()`（或 `run_bytes()`、`output()`）执行 git；网络操作加 `.timeout(NETWORK_TIMEOUT)`。
- runner 已统一设置：`GIT_TERMINAL_PROMPT=0`（需要凭据时直接失败而不是挂起）、`LC_ALL=C`（输出为英文）、`core.quotepath=false`、`color.ui=false`、`log.showSignature=false`、超时结束进程。
- 解析机器格式：`status --porcelain=v2 -z`、`log --format` 配合 `%x00` / `%x1f` 分隔、`-z`；`diff` / `show` / `log -p` 加 `--no-color --no-ext-diff`。尽量不解析面向人的提示文案。
- 用户输入（分支名、路径）不能被当成选项：路径放在 `--` 之后，分支名用 `git check-ref-format --branch` 校验，拒绝以 `-` 开头的名字。
- 不做破坏性的远程操作（强制推送、删除远程分支）。

## 前端约定

- 浅色主题，只用 `src/styles.css` 中的 token：`bg-app`、`bg-surface`、`bg-subtle`、`text-ink`、`text-muted`、`border-line`、`text-accent`、`st-*`（文件状态）、`diff-*`、`lane-0..7`（图谱泳道）；不写死颜色值。
- 图标用 lucide-react；正文 13px，列表项 13–14px；大按钮与输入框用 `rounded-card`（12px）；界面文案用中文。
- 组件只通过本模块的 `api.ts` 调用后端。失败时 `notify.error(err, "推送失败")`；写操作成功后 `emitRepoChanged(repoPath, scope)`；需要跟随刷新的视图用 `useRepoChanged(repoPath, cb)`（窗口重新获得焦点时也会触发）。
- 危险操作（丢弃修改、删除分支）先 `confirmDialog({ danger: true, … })`；需要输入名称时用 `promptDialog`。
- 上百行的列表使用 `@tanstack/react-virtual` 虚拟滚动。
- 当前仓库与视图：`useAppState()`（`selection`、`selectRepo`、`tab`、`setTab`）。

## 测试

- Rust：模块内 `#[cfg(test)]`，用 `crate::git::testutil::TempRepo` 创建隔离的临时仓库，覆盖解析与真实 git 流程。
- 前端：纯逻辑写 `*.test.ts`（vitest，node 环境）；需要 DOM 的文件首行写 `// @vitest-environment jsdom`。
- 界面改动在 `pnpm dev` 的浏览器预览里自查，mock 数据与真实返回结构保持一致。

## Git 工作流

- `main` 为发布分支，`develop` 为开发分支；特性分支从 `develop` 切出，合并统一用 `git merge --no-ff`。
- 提交信息采用 Conventional Commits，描述用中文，例如 `feat(graph): 绘制泳道与合并曲线`。
