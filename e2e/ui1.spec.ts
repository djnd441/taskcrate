import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("sidebar collapses and expands on desktop", async ({ page }) => {
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await expect(page.locator(".app-sidebar--collapsed")).toBeVisible();
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await expect(page.locator(".app-sidebar--collapsed")).toHaveCount(0);
});

test("topbar overview filters in-progress tasks", async ({ page }) => {
  const inProgressStat = page.locator(".topbar-stat").filter({ hasText: "进行中" });
  await expect(inProgressStat).toBeVisible();
  await inProgressStat.click();
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await expect(page.locator(".quick-filter--active")).toContainText("进行中");
});

test("task list switches to compact density", async ({ page }) => {
  await page.getByLabel("行密度").selectOption("compact");
  await expect(page.locator(".task-view--density-compact")).toBeVisible();
});
