import { expect, test } from "@playwright/test";

async function createFromQuickBar(page: import("@playwright/test").Page, title: string): Promise<void> {
  await page.getByLabel("快速新建任务").fill(title);
  await page.getByLabel("快速新建任务").press("Enter");
  const dialog = page.getByRole("dialog", { name: "编辑任务" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "完成创建" }).click();
}

test("IndexedDB persists a task across reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await createFromQuickBar(page, "web 持久化任务");
  const taskRowText = page.locator(".task-row__title").filter({ hasText: "web 持久化任务" });
  await expect(taskRowText).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await expect(taskRowText).toBeVisible();
});

test("mobile viewport has usable touch targets and no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await createFromQuickBar(page, "触控任务");

  const checkboxBox = await page.locator(".ui-checkbox").first().boundingBox();
  expect(checkboxBox?.height ?? 0).toBeGreaterThanOrEqual(34);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("AI history persists across reload", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "AI 助手" }).click();
  await page
    .getByPlaceholder("例如：帮我创建主任务「网站改版」，下面分两个大任务")
    .fill("帮我创建任务：历史记录");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("已创建任务：历史记录")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  const navAfterReload = page.getByRole("navigation", { name: "主导航" });
  await navAfterReload.getByRole("button", { name: "AI 助手" }).click();
  await expect(
    page.locator(".ai-history__title").filter({ hasText: "帮我创建任务：历史记录" }),
  ).toBeVisible();
});
