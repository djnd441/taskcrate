import { expect, test } from "@playwright/test";

test("10k task list renders, searches and scrolls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
  await page.goto("/?benchmark=10000", { waitUntil: "domcontentloaded" });
  const loadStart = Date.now();
  await expect(page.getByText(/共 10000 项任务/)).toBeVisible({ timeout: 10_000 });
  const loadMs = Date.now() - loadStart;

  const searchStart = Date.now();
  await page.getByLabel("搜索").fill("任务 09999");
  await expect(
    page.locator(".task-row__title").filter({ hasText: "任务 09999" }),
  ).toBeVisible();
  const searchMs = Date.now() - searchStart;

  await page.locator(".virtual-task-list").hover();
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(200);
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );

  console.log(`PERF_E2E load=${loadMs}ms search=${searchMs}ms`);
  expect(hasHorizontalOverflow).toBe(false);
  expect(loadMs).toBeLessThan(3000);
  expect(searchMs).toBeLessThan(2000);
});
