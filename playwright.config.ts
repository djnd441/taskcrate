import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      testIgnore: /web-preview\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "web-chromium",
      testMatch: /web-preview\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:1421" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @task-manager/desktop dev --host 127.0.0.1",
      url: "http://127.0.0.1:1420",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @task-manager/web dev --host 127.0.0.1",
      url: "http://127.0.0.1:1421",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
