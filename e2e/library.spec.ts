import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "任务列表" })).toBeVisible();
});

test("inbox stores library files and quick create reuses them", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "收件箱" }).click();
  await page
    .locator(".inbox-card__header")
    .filter({ hasText: "常用资源" })
    .locator("input[type=file]")
    .setInputFiles({
      name: "meeting.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("pdf-content"),
    });
  await expect(
    page.locator(".inbox-library-item").filter({ hasText: "meeting.pdf" }),
  ).toBeVisible();

  await nav.getByRole("button", { name: "列表" }).click();
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "新建任务" });
  await dialog.getByLabel("任务标题").fill("素材任务");
  await dialog.getByRole("button", { name: "开始拆解" }).click();
  const editor = page.getByRole("dialog", { name: "编辑任务" });
  await editor.getByRole("button", { name: "从素材库添加" }).click();
  const picker = page.getByRole("dialog", { name: "从素材库添加" });
  await expect(picker.locator(".library-picker__item").filter({ hasText: "meeting.pdf" })).toBeVisible();
  await picker.getByRole("button", { name: "选择" }).click();
  await editor.getByRole("button", { name: "完成创建" }).click();

  await page.getByText("素材任务").click();
  const panel = page.getByLabel("任务详情");
  await expect(panel.getByText("meeting.pdf")).toBeVisible();
});
