import { describe, expect, it } from "vitest";
import { pushNotificationContract, webNotificationService } from "./notifier";

describe("通知适配层", () => {
  it("Push 通知仅保留契约", async () => {
    expect(pushNotificationContract.kind).toBe("push");
    expect(pushNotificationContract.channel).toBe("taskcrate");
    await expect(pushNotificationContract.notify({ title: "测试" })).rejects.toThrow(
      /尚未实现/,
    );
  });

  it("无浏览器 Notification 环境时 Web 通知返回不可用", async () => {
    expect(webNotificationService.kind).toBe("web");
    await expect(webNotificationService.requestPermission()).resolves.toBe(false);
  });
});
