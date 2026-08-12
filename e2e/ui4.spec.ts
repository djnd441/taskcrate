import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("settings page groups sections into navigation", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "设置" }).click();
  const settingsNav = page.getByRole("navigation", { name: "设置分组" });
  await expect(settingsNav.getByRole("button", { name: "外观" })).toBeVisible();
  await expect(settingsNav.getByRole("button", { name: "AI 助手" })).toBeVisible();
  await settingsNav.getByRole("button", { name: "数据与恢复" }).click();
  await expect(page.locator("#settings-data")).toBeInViewport();
  await expect(
    settingsNav.getByRole("button", { name: "数据与恢复" }),
  ).toHaveAttribute("aria-current", "true");
});

test("reports page shows header and tonal kpi cards", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "报表" }).click();
  await expect(page.locator(".reports-header__title")).toHaveText("报表中心");
  await expect(page.locator(".report-kpi--primary")).toBeVisible();
  await expect(page.locator(".report-kpi--success")).toBeVisible();
  await expect(page.locator(".report-kpi--danger")).toBeVisible();
  await expect(page.locator(".report-kpi--info")).toBeVisible();
});

test("AI chat bubbles show role labels", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "AI 助手" }).click();
  await page
    .getByPlaceholder("例如：帮我创建主任务「网站改版」，下面分两个大任务")
    .fill("帮我创建任务：UI4 演示任务");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("已创建任务：UI4 演示任务")).toBeVisible();
  await expect(page.locator(".ai-bubble__label").filter({ hasText: "你" })).toBeVisible();
  await expect(page.locator(".ai-bubble__label").filter({ hasText: "AI" })).toBeVisible();
});

test("settings exposes full backup restore action", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "设置" }).click();
  await page.getByRole("navigation", { name: "设置分组" }).getByRole("button", { name: "数据与恢复" }).click();
  await expect(page.getByRole("button", { name: "从备份恢复" })).toBeVisible();
});