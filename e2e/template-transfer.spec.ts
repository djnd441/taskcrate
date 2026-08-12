import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
});

test("inbox imports a template from JSON and exports it as a file", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "收件箱" }).click();
  await page.getByRole("button", { name: "粘贴导入模板" }).click();
  const dialog = page.getByRole("dialog", { name: "粘贴导入模板" });
  await dialog.getByLabel("模板 JSON").fill(
    JSON.stringify({
      schemaVersion: 1,
      name: "导入模板测试",
      tasks: [{ title: "导入主任务", taskKind: "main", children: [] }],
    }),
  );
  await dialog.getByRole("button", { name: "导入" }).click();

  const templateItem = page
    .locator(".inbox-template-item")
    .filter({ hasText: "导入模板测试" });
  await expect(templateItem).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await templateItem.getByRole("button", { name: "导出" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("task-template.json");
});
