import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("status panel expands with quick create and detailed cards", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "看板" }).click();
  await page
    .locator(".board-panel-strip__panel")
    .filter({ hasText: "待办" })
    .first()
    .click();
  await expect(page.locator(".board-detail-panel--todo")).toBeVisible();
  await expect(page.getByRole("button", { name: "新增任务" })).toBeVisible();
  await expect(page.locator(".board-task-card").first()).toBeVisible();
});

test("board task cards show priority markers and child progress", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "看板" }).click();
  await page
    .locator(".board-panel-strip__panel")
    .filter({ hasText: "待办" })
    .first()
    .click();
  const firstCard = page.locator(".board-task-card").first();
  await expect(firstCard.locator(".board-task-card__stripe")).toBeVisible();
  await expect(firstCard.locator(".board-task-card__priority-dot")).toBeVisible();
});
