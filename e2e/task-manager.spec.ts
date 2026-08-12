import { expect, test, type Page } from "@playwright/test";

async function createFromQuickBar(page: Page, title: string): Promise<void> {
  await page.getByLabel("快速新建任务").fill(title);
  await page.getByLabel("快速新建任务").press("Enter");
  const dialog = page.getByRole("dialog", { name: "编辑任务" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "完成创建" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("app shell renders navigation and default task list", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "主导航" });
  await expect(nav.getByRole("button", { name: "列表" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "看板" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "回收站" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "设置" })).toBeVisible();
});

test("switches between views", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "看板" }).click();
  await expect(page.getByRole("heading", { name: "看板", exact: true })).toBeVisible();

  await nav.getByRole("button", { name: "回收站" }).click();
  await expect(page.getByRole("heading", { name: "回收站", exact: true })).toBeVisible();

  await nav.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
});

test("command palette navigates with keyboard and runs a command", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.keyboard.press("Control+k");
  const input = page.getByLabel("搜索命令");
  await expect(input).toBeVisible();
  await input.fill("看板");
  await expect(page.getByRole("option", { name: /看板/ })).toBeVisible();
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "看板", exact: true })).toBeVisible();
});

test("AI assistant opens and responds in demo mode", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "AI 助手" }).click();
  await expect(
    page.getByLabel("AI 助手视图").getByRole("heading", { name: "AI 助手" }),
  ).toBeVisible();
  await page
    .getByPlaceholder("例如：帮我创建主任务「网站改版」，下面分两个大任务")
    .fill("帮我创建任务：AI 演示任务");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("已创建任务：AI 演示任务")).toBeVisible();
  await expect(
    page.locator(".ai-history__title").filter({ hasText: "帮我创建任务：AI 演示任务" }),
  ).toBeVisible();
});

test("AI settings expose provider configuration and test connection", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "设置" }).click();
  const section = page.locator(".settings-section").filter({ hasText: "AI 助手" });
  await expect(section.getByLabel("提供商")).toHaveValue("off");
  await section.getByRole("button", { name: "测试连接" }).click();
  await expect(page.getByText(/演示连接成功/)).toBeVisible();
});

test("reminder settings expose sound and closed-app reminders", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "设置" }).click();
  const section = page.locator(".settings-section").filter({ hasText: "提醒" });
  await expect(section.getByLabel("启用声音")).toBeChecked();
  await section.getByRole("button", { name: "试听" }).click();
  await expect(page.getByText("已播放提醒音")).toBeVisible();
  await expect(section.getByLabel("关闭后提醒")).toBeChecked();
});

test("help menu opens keyboard shortcuts", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.getByRole("button", { name: "帮助" }).click();
  await page.getByRole("menuitem", { name: "键盘快捷键" }).click();
  const dialog = page.getByRole("dialog", { name: "键盘快捷键" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Ctrl", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("N", { exact: true }).first()).toBeVisible();
});

test("feedback modal exports feedback file", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.getByRole("button", { name: "帮助" }).click();
  await page.getByRole("menuitem", { name: "反馈", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "反馈" });
  await dialog.getByLabel("反馈描述").fill("e2e 反馈内容");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出反馈文件" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("反馈");
});

test("update modal shows current version and source status", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.getByRole("button", { name: "帮助" }).click();
  await page.getByRole("menuitem", { name: "检查更新" }).click();
  const dialog = page.getByRole("dialog", { name: "检查更新" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("0.1.0")).toBeVisible();
  await expect(dialog.getByText(/暂未配置更新源/)).toBeVisible();
});

test("theme switches between dark and light", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "设置" }).click();

  await page.getByRole("button", { name: "暗色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "亮色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("Ctrl+N opens quick create and creates a task", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "新建任务" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("任务标题").fill("e2e 新任务");
  await dialog.getByRole("button", { name: "开始拆解" }).click();
  const editor = page.getByRole("dialog", { name: "编辑任务" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "完成创建" }).click();
  await expect(page.getByText("e2e 新任务")).toBeVisible();
});

test("quick create enters editor and creates breakdown with resources", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "新建任务" });
  const input = dialog.getByLabel("任务标题");
  await input.fill("e2e 主任务");
  await input.press("Enter");
  const editor = page.getByRole("dialog", { name: "编辑任务" });
  await expect(editor).toBeVisible();

  const breakdown = editor.locator(".create-editor-section").filter({ hasText: "任务拆解" });
  await breakdown.getByRole("button", { name: "添加大任务" }).click();
  await editor.getByPlaceholder("输入大任务标题").fill("e2e 大任务");
  await breakdown.getByRole("button", { name: "添加小任务" }).click();
  await editor.getByPlaceholder("输入小任务标题").fill("e2e 小任务");

  const resourceSection = editor
    .locator(".create-editor-section")
    .filter({ hasText: "主任务工具与资源" });
  await resourceSection.getByRole("button", { name: "添加" }).click();
  await resourceSection.getByPlaceholder("例如：电脑、预算、协作者").fill("笔记本电脑");

  await editor.getByRole("button", { name: "完成创建" }).click();
  await expect(page.getByText("e2e 主任务")).toBeVisible();
  await page.getByRole("button", { name: "展开 e2e 主任务" }).click();
  await expect(page.getByText("e2e 大任务")).toBeVisible();
  await expect(page.getByText("e2e 小任务")).toBeVisible();

  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "看板" }).click();
  await page.getByRole("button", { name: "按主任务" }).click();
  await expect(page.getByRole("heading", { name: "e2e 主任务" })).toBeVisible();
  await expect(page.locator(".board-card__title").filter({ hasText: "e2e 大任务" })).toBeVisible();
  await expect(page.locator(".board-card__title").filter({ hasText: "e2e 小任务" })).toBeVisible();
});

test("main task box stores attachments and exposes package", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "新建任务" });
  await dialog.getByLabel("任务标题").fill("e2e 附件箱");
  await dialog.getByRole("button", { name: "开始拆解" }).click();
  const editor = page.getByRole("dialog", { name: "编辑任务" });
  await expect(editor).toBeVisible();

  await editor.locator(".attachment-editor__input").setInputFiles({
    name: "meeting.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("pdf-content"),
  });
  await expect(editor.getByText("meeting.pdf")).toBeVisible();
  await editor.getByRole("button", { name: "完成创建" }).click();

  await expect(
    page.locator(".task-row").filter({ hasText: "e2e 附件箱" }).getByText("1 个附件"),
  ).toBeVisible();
  await page.getByText("e2e 附件箱").click();
  const panel = page.getByLabel("任务详情");
  await expect(panel.getByText("meeting.pdf")).toBeVisible();
  await expect(panel.getByRole("button", { name: "打包下载" })).toBeVisible();
});

test("quick create input keeps focus while typing", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "新建任务" });
  const input = dialog.getByLabel("任务标题");
  await input.fill("任");
  expect(await input.evaluate((element) => document.activeElement === element)).toBe(true);
  await input.fill("任务");
  expect(await input.evaluate((element) => document.activeElement === element)).toBe(true);
});

test("mobile layout holds without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.getByRole("button", { name: "打开菜单" }).click();
  await expect(page.locator(".app-sidebar--open")).toBeVisible();
});

test("search filters the task list", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.getByLabel("搜索").fill("季度计划");
  await expect(page.getByText("整理季度计划")).toBeVisible();
  await expect(page.getByText("预约体检")).toBeHidden();
});

test("quick filter shows only completed tasks", async ({ page }) => {
  await page.getByRole("button", { name: "已完成", exact: true }).click();
  await expect(page.getByText("复习 Rust 生命周期")).toBeVisible();
  await expect(page.getByText("整理季度计划")).toBeHidden();
});

test("drags a board card between status columns", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "看板" }).click();
  const inProgressPanel = page
    .locator(".board-panel-strip__panel")
    .filter({ hasText: "进行中" })
    .first();
  await inProgressPanel.click();
  const card = page.locator(".board-task-card").filter({ hasText: "整理季度计划" }).first();
  await expect(card).toBeVisible();
  const todoPanel = page.locator(".board-panel-strip__panel").filter({ hasText: "待办" }).first();
  const cardBox = await card.boundingBox();
  const panelBox = await todoPanel.boundingBox();
  if (!cardBox || !panelBox) {
    throw new Error("看板卡片或目标面板不可见");
  }
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(page.getByText("状态已更新")).toBeVisible();
  await todoPanel.click();
  const todoCard = page.locator(".board-task-card").filter({ hasText: "整理季度计划" }).first();
  await expect(todoCard).toBeVisible();

  await todoCard.getByText("整理季度计划").click();
  await expect(page.getByLabel("任务详情").getByLabel("状态")).toHaveValue("todo");
});

test("moves a board card via touch-friendly menu", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "看板" }).click();
  await page.locator(".board-panel-strip__panel").filter({ hasText: "进行中" }).first().click();
  await page.getByRole("button", { name: "移动 整理季度计划", exact: true }).click();
  await page.getByRole("menuitem", { name: "移动到 待办" }).click();
  await expect(page.getByText("状态已更新")).toBeVisible();
});

test("edits task details from the detail panel", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.getByText("整理季度计划").click();
  const panel = page.getByLabel("任务详情");
  await expect(panel).toBeVisible();
  await panel.getByLabel("标题").fill("整理季度计划 v2");
  await panel.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("任务已保存")).toBeVisible();
  await expect(
    page.locator(".task-row__title").filter({ hasText: "整理季度计划 v2" }),
  ).toBeVisible();
});

test("batch deletes a task and restores it from trash", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await createFromQuickBar(page, "e2e 批量任务");
  const taskRowText = page.locator(".task-row__title").filter({ hasText: "e2e 批量任务" });
  await expect(taskRowText).toBeVisible();

  await page.getByRole("checkbox", { name: "选择 e2e 批量任务" }).check();
  await page.getByRole("button", { name: "删除", exact: true }).click();

  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "回收站" }).click();
  await expect(page.locator(".trash-row__title").filter({ hasText: "e2e 批量任务" })).toBeVisible();

  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await nav.getByRole("button", { name: "列表" }).click();
  await expect(taskRowText).toBeVisible();
});

test("settings creates a backup", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: "立即备份" }).click();
  await expect(page.getByText("备份完成")).toBeVisible();
});

test("creates a project and a tag from settings", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "设置" }).click();
  const entitySection = page.locator(".settings-section").filter({ hasText: "项目与标签" });
  await expect(entitySection).toBeVisible();

  await entitySection.getByLabel("新建项目").fill("e2e 项目");
  await entitySection.getByRole("button", { name: "添加", exact: true }).first().click();
  await expect(entitySection.getByText("e2e 项目")).toBeVisible();

  await entitySection.getByLabel("新建标签").fill("e2e 标签");
  await entitySection.getByRole("button", { name: "添加", exact: true }).nth(1).click();
  await expect(entitySection.getByText("e2e 标签")).toBeVisible();
});

test("share modal exposes task summary and export options", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.getByText("整理季度计划").click();
  const panel = page.getByLabel("任务详情");
  await panel.getByRole("button", { name: "分享" }).click();
  const dialog = page.getByRole("dialog", { name: "分享任务" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("复制任务摘要")).toBeVisible();
  await expect(dialog.getByText("导出任务文件")).toBeVisible();
  await expect(dialog.getByText("导出 ZIP 包")).toBeVisible();
  await dialog.getByText("导出任务文件").click();
  await expect(page.getByText("任务文件已导出")).toBeVisible();
});

test("list row share button opens share dialog without opening detail", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  const row = page.locator(".task-row").filter({ hasText: "整理季度计划" });
  await row.getByRole("button", { name: "分享 整理季度计划" }).click();
  const dialog = page.getByRole("dialog", { name: "分享任务" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("任务详情")).not.toBeVisible();
  await dialog.locator(".share-actions").getByRole("button", { name: "关闭" }).click();
  await expect(dialog).not.toBeVisible();
});

test("inbox navigation shows uncategorized quick captures", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await createFromQuickBar(page, "e2e 收件箱任务");
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "收件箱" }).click();
  await expect(page.getByRole("heading", { name: "收件箱" })).toBeVisible();
  await expect(page.locator(".inbox-view")).toBeVisible();
  await expect(page.locator(".inbox-card__title").filter({ hasText: "最近收集" })).toBeVisible();
  await expect(page.getByText("e2e 收件箱任务")).toBeVisible();
});

test("recurring main task creates next occurrence after completion", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "新建任务" });
  await dialog.getByLabel("任务标题").fill("e2e 周期任务");
  await dialog.getByRole("button", { name: "开始拆解" }).click();
  const editor = page.getByRole("dialog", { name: "编辑任务" });
  await editor.getByLabel("重复").selectOption("weekly");
  await editor.getByRole("button", { name: "完成创建" }).click();
  await expect(page.locator(".task-row").filter({ hasText: "e2e 周期任务" }).getByText("每周")).toBeVisible();

  await page.getByRole("checkbox", { name: "完成 e2e 周期任务" }).click();
  await expect(page.locator(".task-row__title").filter({ hasText: "e2e 周期任务" })).toHaveCount(2);
});

test("saves a breakdown as template and applies it from quick create", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "新建任务" });
  await dialog.getByLabel("任务标题").fill("e2e 模板源任务");
  await dialog.getByRole("button", { name: "开始拆解" }).click();
  const editor = page.getByRole("dialog", { name: "编辑任务" });
  const breakdown = editor.locator(".create-editor-section").filter({ hasText: "任务拆解" });
  await breakdown.getByRole("button", { name: "添加大任务" }).click();
  await editor.getByPlaceholder("输入大任务标题").fill("e2e 模板大任务");
  await editor.getByRole("button", { name: "保存为模板" }).click();

  const saveDialog = page.getByRole("dialog", { name: "保存为模板" });
  await saveDialog.getByLabel("模板名称").fill("e2e 模板");
  await saveDialog.getByRole("button", { name: "保存模板" }).click();
  await expect(page.getByText("模板已保存")).toBeVisible();

  await page.keyboard.press("Control+n");
  const newDialog = page.getByRole("dialog", { name: "新建任务" });
  await newDialog.getByRole("button", { name: "从模板" }).click();
  await page.getByRole("button", { name: /e2e 模板/ }).click();
  const appliedEditor = page.getByRole("dialog", { name: "编辑任务" });
  await expect(appliedEditor.getByLabel("任务标题")).toHaveValue("e2e 模板源任务");
  await expect(appliedEditor.getByPlaceholder("输入大任务标题")).toHaveValue("e2e 模板大任务");
});
test("reports view shows kpis, project progress and audit section", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "报表" }).click();
  await expect(page.getByRole("heading", { name: "报表" })).toBeVisible();
  await expect(page.locator(".report-kpi")).toHaveCount(4);
  await expect(page.locator(".report-card").filter({ hasText: "项目进度" })).toBeVisible();
  await expect(page.locator(".report-card").filter({ hasText: "人员负载" })).toBeVisible();
  await expect(page.locator(".report-card").filter({ hasText: "状态分布" })).toBeVisible();
  await expect(page.locator(".report-card").filter({ hasText: "审计日志" })).toBeVisible();
});

test("enterprise fields are editable from task details", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.getByText("整理季度计划").click();
  const panel = page.getByLabel("任务详情");
  await panel.getByLabel("负责人").fill("王五");
  await panel.getByLabel("部门").fill("研发部");
  await panel.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("任务已保存")).toBeVisible();
  await expect(panel.getByLabel("负责人")).toHaveValue("王五");
  await expect(panel.getByLabel("部门")).toHaveValue("研发部");
});
test("task comments can be added from the detail panel", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.getByText("整理季度计划").click();
  const panel = page.getByLabel("任务详情");
  await panel.getByLabel("评论内容").fill("@王五 请今天确认");
  await panel.getByRole("button", { name: "发布评论" }).click();
  await expect(panel.getByText("@王五 请今天确认")).toBeVisible();
});

test("project collaboration members can be added from settings", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "设置" }).click();
  const section = page.locator(".settings-section").filter({ hasText: "项目与标签" });
  await section.getByRole("button", { name: "成员 工作" }).click();
  await section.getByLabel("成员名称").fill("王五");
  await section.getByRole("button", { name: "添加成员" }).click();
  await expect(section.getByText("王五", { exact: true })).toBeVisible();
});