import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("detail panel groups fields into collapsible sections", async ({ page }) => {
  await page.getByText("整理季度计划").click();
  const panel = page.getByLabel("任务详情");
  await expect(panel.locator(".detail-group__label").filter({ hasText: "基本信息" })).toBeVisible();
  await expect(panel.locator(".detail-group__label").filter({ hasText: "计划执行" })).toBeVisible();
  await expect(panel.locator(".detail-group__label").filter({ hasText: "资源附件" })).toBeVisible();
  await expect(panel.locator(".detail-group__label").filter({ hasText: "协作评论" })).toBeVisible();
  await expect(panel.getByLabel("状态")).toBeVisible();
});

test("quick create shows two-step progress and editor summary", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "新建任务" });
  await expect(dialog.locator(".quick-create-steps")).toBeVisible();
  await dialog.getByLabel("任务标题").fill("e2e 两步任务");
  await dialog.getByRole("button", { name: "开始拆解" }).click();
  const editor = page.getByRole("dialog", { name: "编辑任务" });
  await expect(editor.locator(".quick-create-steps__item--active")).toContainText("2 拆解配置");
  await expect(editor.locator(".create-editor-summary")).toBeVisible();
});

test("global capture requires confirmation before storing", async ({ page }) => {
  await page.goto("/?capture");
  await page.getByLabel("速记内容").fill("速记确认测试");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "存入收件箱" })).toBeVisible();
  await expect(page.getByRole("button", { name: "转为主任务" })).toBeVisible();
  await page.getByRole("button", { name: "存入收件箱" }).click();
  await expect(page.getByText("已存入收件箱")).toBeVisible();
});
