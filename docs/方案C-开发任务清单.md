# TaskCrate · 方案 C 开发任务清单

> 技术路线：Tauri 2 + Rust + React + TypeScript + rusqlite（SQLite WAL）+ Zustand + pnpm monorepo
> 当前阶段：仅开发电脑端；手机端只做架构预留验证，不开发手机功能。
> 执行方式：按 Phase 顺序执行，任务完成后勾选，Phase 通过验收后再进入下一 Phase。

## 0. 总览

| Phase | 名称 | 预估周期 | 状态 |
| --- | --- | --- | --- |
| 0 | 工程搭建 | 2 天 | 已完成 |
| 1 | 领域模型与数据层 | 5 天 | 已完成 |
| 2 | 前端框架与设计系统 | 4 天 | 已完成 |
| 3 | 核心功能实现（电脑端） | 12 天 | 已完成 |
| 4 | 测试、性能与打包 | 4 天 | 已完成 |
| 5 | 双端兼容预留验证 | 3 天 | 已完成 |

合计约 30 个工作日（5-6 周），含测试与打磨。
当前状态：0-5 阶段全部完成，电脑端首轮开发交付。

## 1. 已锁定技术决策

- 包管理：pnpm workspace monorepo
- 桌面壳：Tauri 2（Rust 后端）
- 前端：React 18 + TypeScript + Vite
- 状态管理：Zustand
- 存储：SQLite（rusqlite，WAL 模式，外键开启，迁移版本化）
- 组件：自研 packages/ui + lucide-react，不引入大型 UI 框架
- 拖拽：@dnd-kit/core
- 测试：cargo test / Vitest / Playwright（Web 预览形态跑 e2e）
- 打包：tauri build（Windows 安装包）
- 安全：Tauri capabilities 白名单、CSP、不开放任意 shell

## 2. Phase 0：工程搭建

- [x] 0.1 初始化 pnpm monorepo（根 package.json、pnpm-workspace.yaml、.gitignore、README）
- [x] 0.2 确认本机环境：Node 20+、Rust stable、pnpm、Tauri CLI、Windows 构建依赖（MSVC/WebView2）
- [x] 0.3 创建 packages/domain（纯 TS 领域包，独立 tsconfig 与构建配置）
- [x] 0.4 创建 packages/ui（设计令牌 + 组件包，独立 tsconfig 与构建配置）
- [x] 0.5 创建 apps/desktop：Tauri 2 + React + Vite + TS，跑通 pnpm dev
- [x] 0.6 接入 ESLint + Prettier + Vitest + Playwright 基线
- [x] 0.7 根级脚本统一：dev / build / lint / typecheck / test
- [x] 0.8 空窗口验收：启动无报错、HMR 生效、依赖锁定文件生成

验收：pnpm dev 能打开桌面窗口；pnpm lint、pnpm typecheck、pnpm test 全绿。
交付物：monorepo 骨架、环境说明 README。

## 3. Phase 1：领域模型与数据层

- [x] 1.1 定义任务模型 Task：id、标题、备注、截止时间、优先级、状态、标签、项目、创建/更新/完成/删除时间、schemaVersion
- [x] 1.2 定义 Project、Tag、Settings 模型与枚举（TaskStatus、Priority）
- [x] 1.3 在 packages/domain 声明 Repository 端口：TaskRepository、ProjectRepository、TagRepository、SettingsRepository
- [x] 1.4 定义任务状态机：待办→进行中→已完成→已取消；归档与回收站流转；非法流转拒绝
- [x] 1.5 Rust 侧初始化 SQLite：WAL、外键、schema_version、migration 机制
- [x] 1.6 Rust 实现 repositories：CRUD、列表、组合筛选、搜索
- [x] 1.7 Rust 实现事务化写路径：创建、编辑、状态流转、软删除、恢复、彻底删除
- [x] 1.8 Tauri command 层与类型安全的 TS/Rust 桥（serde 映射，可选 tauri-specta 自动生成）
- [x] 1.9 首次启动初始化：建表、迁移执行、默认项目与标签
- [x] 1.10 Rust 单元测试：状态机、CRUD、筛选、迁移

验收：重启应用数据不丢；非法状态流转被拒绝；cargo test 全绿。
交付物：数据模型文档、数据库迁移脚本、command 接口清单。

## 4. Phase 2：前端框架与设计系统

- [x] 2.1 设计令牌落地：颜色（非单色系，2-3 个功能主色）、间距、字号、圆角、阴影、暗色/亮色
- [x] 2.2 响应式骨架：三档断点（≥1200 桌面 / 768-1199 平板 / <768 手机预留），app shell 含侧栏、主区、可折叠详情面板
- [x] 2.3 packages/ui 首批组件：Button、IconButton、Input、Select、Checkbox、Badge、Tag、Modal、Popover、Tooltip、Menu、Toast、EmptyState、Skeleton、Kbd
- [x] 2.4 packages/domain 前端服务层：desktop adapter 调 Tauri invoke，接口与 Repository 端口一致
- [x] 2.5 Zustand stores：tasksStore、projectsStore、settingsStore、uiStore，统一走 selectors
- [x] 2.6 视图切换框架：列表、看板、回收站、设置四类视图，预留路由能力
- [x] 2.7 全局快捷键基础设施：Ctrl+N、Ctrl+K、Esc 注册与冲突处理
- [x] 2.8 Playwright 基线：Web 预览形态（mock adapter）跑通基础渲染与断点检查

验收：暗色/亮色可切换；缩放到手机宽度时布局骨架不破；组件无样式溢出。
交付物：设计令牌文档、组件清单、store 结构说明。

## 5. Phase 3：核心功能实现（电脑端）

- [x] 3.1 任务列表视图：加载、分组、排序、批量选择、虚拟滚动
- [x] 3.2 快速新建：顶部输入框 + 回车连续录入 + Ctrl+N
- [x] 3.3 任务详情编辑：弹窗/右侧面板，前端 zod 与 Rust 后端双重校验
- [x] 3.4 看板视图：按状态/项目分列，@dnd-kit 拖拽，拖拽后走 Rust 状态机
- [x] 3.5 搜索与组合筛选：关键词 + 标签/项目/优先级/截止/状态，支持保存筛选视图
- [x] 3.6 到期提醒：Rust 后台定时扫描 + 桌面通知 + 逾期高亮 + 未完成清单
- [x] 3.7 回收站：软删除、恢复、彻底删除、清空
- [x] 3.8 批量操作：批量完成、删除、改优先级、移动项目、加标签
- [x] 3.9 设置页：数据目录、提醒开关、备份频率、主题、导入导出入口
- [x] 3.10 导入导出：JSON 全量备份、CSV 通用导出、导入校验与去重策略
- [x] 3.11 自动备份：定时复制数据库 + 保留最近 N 份 + 恢复指引
- [x] 3.12 快捷键补齐：Ctrl+K 命令面板（新建、搜索、切换视图）
- [x] 3.13 错误兜底：写入失败提示、数据库损坏提示与恢复引导

验收：第一轮规划的 P0 功能清单全部可用；核心链路有 e2e 覆盖。
交付物：可安装桌面版、功能验收清单。

## 6. Phase 4：测试、性能与打包

- [x] 4.1 Rust 全量单测补全：repository、状态机、迁移、备份
- [x] 4.2 TS 单测：筛选器、视图模型、stores
- [x] 4.3 Playwright e2e 主链路：新建→筛选→拖拽→完成→回收站恢复
- [x] 4.4 性能基准：1 万条任务启动 <3s、搜索 <200ms、列表滚动流畅，记录结果
- [x] 4.5 打包：tauri build 产出 Windows 安装包，安装后冒烟测试
- [x] 4.6 体积与性能优化：按基准结果调整
- [x] 4.7 文档完善：README、架构图、数据模型、command 清单、构建发布说明

验收：安装包可安装可卸载；主链路 e2e 通过；性能基准达标并记录。
交付物：Windows 安装包、质量报告。

## 7. Phase 5：双端兼容预留验证（不做手机功能）

- [x] 5.1 apps/web 预览形态：复用 domain + ui，IndexedDB adapter 跑通读改写
- [x] 5.2 触摸交互映射：拖拽、右键、悬停均有按钮/菜单替代方案
- [x] 5.3 通知适配层：桌面 Notification 与未来 Push 共用接口，Push 仅留契约
- [x] 5.4 断点与触控目标验收：<768 宽度下核心界面可用性验证
- [x] 5.5 移动端开发指引：后续接入 Tauri Mobile / Web 容器的步骤与限制
- [x] 5.6 需求 backlog 建立：手机端功能按后续需求分步进入

验收：同一套 domain + ui 在 Web 形态跑通；触屏替代操作可用；手机端未开发任何专属功能。
交付物：Web 预览包、双端兼容验证报告、移动端接入指引。

## 8. 执行规则

- 按 Phase 顺序执行，不跨阶段开发。
- 每个任务完成后勾选，并向用户同步验收结果。
- 新需求先写入下方 backlog，评估后插入对应 Phase，不临时改架构。
- 用户确认一个 Phase 的验收后，才进入下一 Phase。

## 9. 需求 backlog

| 日期 | 需求 | 目标 Phase | 状态 |
| --- | --- | --- | --- |
| 2026-08-06 | 手机端基础壳：Tauri Mobile / PWA 二选一 | 后续迭代 | 待排期 |
| 2026-08-06 | 手机端布局：底部导航、全屏详情、触控目标 | 后续迭代 | 待排期 |
| 2026-08-06 | 手机端快捷录入与提醒 | 后续迭代 | 待排期 |
| 2026-08-06 | Push 通知接入（契约已预留） | 后续迭代 | 待排期 |
| 2026-08-06 | 跨设备同步与账号体系 | 后续迭代 | 待排期 |
| 2026-08-06 | 移动端文件导入导出与备份 | 后续迭代 | 待排期 |
| 2026-08-08 | 阶段一个人实用增强：全局速记、收件箱、周期任务、任务模板 | 电脑端迭代 | 已完成 |
| 2026-08-08 | 阶段二本地企业增强：企业字段、报表中心、审计日志、Excel/CSV 导入导出 | 电脑端迭代 | 已完成 |
| 2026-08-08 | 阶段三本地轻协作：任务评论、项目成员、钉钉/企微/飞书通知渠道 | 电脑端迭代 | 已完成 |
| 2026-08-08 | 阶段三后续：账号体系、自托管同步后端、多端实时协作 | 待立项 | 待排期 |
