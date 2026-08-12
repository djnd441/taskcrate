# Phase 2 · 设计系统与前端框架说明

> 对应任务清单 Phase 2，交付设计令牌、组件清单、store 结构、快捷键与断点规范。

## 1. 设计令牌

令牌集中在 `packages/ui/src/tokens.css`，通过 `:root` 与 `[data-theme="dark"]` 双主题变量实现亮色/暗色切换。

| 分类 | 令牌 | 亮色默认值 | 暗色默认值 |
| --- | --- | --- | --- |
| 功能主色 | `--ui-color-primary` | `#2563EB` 蓝 | `#5B8BFF` |
| 成功 | `--ui-color-success` | `#16A34A` 绿 | `#34D399` |
| 警告 | `--ui-color-warning` | `#D97706` 琥珀 | `#FBBF24` |
| 危险 | `--ui-color-danger` | `#DC2626` 红 | `#F87171` |
| 信息 | `--ui-color-info` | `#0891B2` 青 | `#22D3EE` |
| 强调 | `--ui-color-accent` | `#7C3AED` 紫（少量点缀） | `#A78BFA` |
| 背景 | `--ui-bg` / `--ui-surface` | `#F5F6F8` / `#FFFFFF` | `#10141B` / `#171C26` |
| 文本 | `--ui-text` / `--ui-text-muted` | `#1C2129` / `#6B7280` | `#EEF1F6` / `#A3ADBC` |
| 边框 | `--ui-border` / `--ui-border-strong` | `#E2E5EA` / `#C9CFD8` | `#2A3140` / `#3B4354` |

间距：`4 / 8 / 12 / 16 / 20 / 24 / 32px`（`--ui-space-1..8`）。
字号：`12 / 13 / 14 / 16 / 20 / 24px`（`--ui-font-size-xs..2xl`）。
圆角：`4 / 6 / 8px`，卡片不超过 `8px`。
阴影：`--ui-shadow-sm` 与 `--ui-shadow-md` 两级。
聚焦态：统一 `--ui-focus-ring`，键盘可达组件全部支持 `:focus-visible`。

## 2. 组件清单（packages/ui）

已实现并导出：

| 组件 | 用途 |
| --- | --- |
| `Button` | 主/次/幽灵/危险四类，sm/md 两档 |
| `IconButton` | 图标按钮，必填 `label` 提供无障碍名称 |
| `Input` | 输入框，支持 label、hint、error |
| `Select` | 原生 select 包装，支持占位与 label |
| `Checkbox` | 复选框，可带 label |
| `Badge` | 状态/优先级徽标，6 种 tone，可带圆点 |
| `Tag` | 标签块，支持自定义颜色与移除按钮 |
| `Modal` | 弹窗，支持 Esc/遮罩关闭、滚动锁定、sm/md/lg |
| `Popover` | 浮层，支持外部点击与 Esc 关闭 |
| `Tooltip` | 悬停/聚焦提示 |
| `Menu` | 菜单项列表，支持图标、快捷键与危险项 |
| `Toast` | 通知栈，`ToastProvider` + `useToast().push()` |
| `EmptyState` | 空状态占位，支持图标与操作区 |
| `Skeleton` | 骨架屏加载占位 |
| `Kbd` | 键盘按键样式 |

## 3. Store 结构（Zustand）

统一通过 `packages/domain` 类型与 selectors 消费：

| Store | 职责 |
| --- | --- |
| `tasksStore` | 任务分页列表、筛选、排序、全部写操作与错误态 |
| `projectsStore` | 项目列表与 CRUD |
| `tagsStore` | 标签列表与 CRUD |
| `settingsStore` | 设置读取/更新（主题、提醒、备份） |
| `uiStore` | 当前视图、侧栏、详情面板、命令面板、快捷新建状态 |

`stores/selectors.ts` 提供 `selectTasks`、`selectTaskById`、`selectProjects`、`selectTags`、`selectTheme` 等纯 selector，组件不直接读内部字段结构。

## 4. Adapter 结构

`apps/desktop/src/adapters` 提供与 Repository 端口一致的统一出口：

- `types.ts`：`AppAdapters` 聚合任务/项目/标签/设置四组端口。
- `desktopAdapter.ts`：Tauri 运行时调用 `bridge.ts` 的 24 个 command。
- `mockAdapter.ts`：Web 预览/测试用的内存实现，含默认项目、标签与示例任务。
- `index.ts`：按 `window.__TAURI_INTERNALS__` 自动选择真实或 mock 实现，后续 `apps/web` 可替换为 IndexedDB adapter。

## 5. 全局快捷键

`shortcuts/shortcuts.ts` 提供注册表式快捷键：

| 快捷键 | 行为 | 冲突策略 |
| --- | --- | --- |
| `Ctrl+N` | 打开新建任务 | 输入态不触发；命令面板打开时不触发 |
| `Ctrl+K` | 打开/关闭命令面板 | 输入态不触发 |
| `Esc` | 关闭命令面板与快捷新建 | 允许在输入态触发 |

注册按优先级排序，同一按键只有首个匹配 handler 生效。

## 6. 断点与响应式

| 断点 | 形态 |
| --- | --- |
| `≥1200px` | 桌面：侧栏常驻 + 主区 + 详情面板 |
| `768-1199px` | 平板：看板两列，侧栏常驻 |
| `<768px` | 手机预留：侧栏抽屉化、看板单列、详情面板全高抽屉、任务行隐藏次要徽标 |

验收已由 Playwright 覆盖：基础渲染、视图切换、暗色/亮色、`Ctrl+N` 快捷新建、375px 宽度无横向溢出。
