# TaskCrate

桌面优先、移动端就绪的任务管理应用。采用方案 C：Tauri 2 + Rust + React + TypeScript + SQLite + Zustand + pnpm monorepo。

当前状态：电脑端首轮开发全部完成，含 Windows 安装包、Web 预览与移动端接入预留。

## 已实现功能

- 列表视图：搜索、组合筛选、分组、排序、批量选择、虚拟滚动、保存筛选视图
- 快速新建：顶部输入回车连续录入、Ctrl+N
- 全局速记：Ctrl+Shift+Space 随时呼出速记窗，回车存入收件箱
- 收件箱：侧边栏一键查看未归类速记，安排项目后自动离开
- 周期任务：每日/每周/每月/自定义间隔，完成主任务后自动生成下一次
- 任务模板：保存主任务拆解与工具资源，新建时一键套用
- 企业字段：负责人、部门、开始时间、完成标准、预算，用于轻商用协作管理
- 报表中心：项目进度、人员负载、状态分布、逾期与完成率
- 审计日志：记录任务创建、更新、归档、删除等关键操作
- Excel/CSV：双向导入导出，支持项目与标签自动创建
- 任务评论：任务详情内评论与 @提醒，@ 内容触发协作通知
- 协作成员：项目支持查看/编辑/管理员角色成员管理
- 协作通知：钉钉、企业微信、飞书机器人 Webhook，到期与 @评论推送
- 任务详情：右侧面板编辑标题、备注、优先级、项目、标签、截止时间
- 看板：按状态/项目分列，拖拽移动并校验状态机
- 快捷筛选：今天/7天内/重要/紧急/已完成/进行中
- 提醒：Rust 后台扫描到期任务、桌面通知、逾期高亮
- 回收站：软删除、恢复、彻底删除、清空
- 批量操作：完成、删除、改优先级、移动项目、添加标签
- 备份与数据：自动备份、JSON 全量导入导出、CSV 导出、恢复指引
- 设置管理：项目/标签的新建、编辑、归档与删除
- 命令面板：方向键选择 + Enter 执行
- 帮助中心：键盘快捷键、反馈、检查更新

## 目录结构

- `apps/desktop`：Tauri 2 桌面端（前端 + Rust 后端）
- `packages/domain`：领域模型、Repository 端口、前端服务层
- `packages/ui`：设计令牌与通用组件
- `docs/架构图.md`：总体架构与数据流
- `docs/数据模型.md`：表结构与状态机
- `docs/命令清单.md`：Tauri command 清单
- `docs/构建发布说明.md`：构建、安装、性能与体积
- `docs/Phase4-质量报告.md`：测试、性能与安装包校验
- `docs/双端兼容报告.md`：Web 预览、触屏替代、通知契约验证结果
- `docs/移动端开发指引.md`：后续移动端接入步骤与限制
- `docs/项目验收总结.md`：整体交付与质量结果
- `docs/迭代日志.md`：电脑端后续迭代记录
- `docs/方案C-开发任务清单.md`：开发任务清单与进度

## 常用命令

- `pnpm install`：安装依赖
- `pnpm tauri:dev`：启动桌面端开发模式
- `pnpm dev`：仅启动前端 Vite 开发服务器
- `pnpm web:dev`：启动 Web 预览（IndexedDB 持久化）
- `pnpm typecheck`：全仓类型检查
- `pnpm lint`：代码检查
- `pnpm test`：运行测试
- `pnpm build`：构建前端产物
- `pnpm e2e`：运行 Playwright 端到端测试
- `pnpm --filter @task-manager/desktop tauri build`：生成 Windows 安装包

## 环境要求

- Windows 10/11 + WebView2 Runtime
- Node.js 20+
- pnpm
- Rust stable（MSVC 工具链）

国内网络下载 Playwright 浏览器时建议使用镜像源：

```powershell
$env:PLAYWRIGHT_DOWNLOAD_HOST = "https://npmmirror.com/mirrors/playwright"
pnpm exec playwright install chromium
```
