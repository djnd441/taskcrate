import { describe, expect, it } from "vitest";
import { buildFeedbackText } from "./feedback";

describe("反馈内容生成", () => {
  it("包含类型、版本与描述", () => {
    const text = buildFeedbackText({
      type: "功能建议",
      description: "希望支持日历视图",
      appVersion: "0.1.0",
      platform: "Windows",
      userAgent: "test-agent",
    });
    expect(text).toContain("功能建议");
    expect(text).toContain("0.1.0");
    expect(text).toContain("希望支持日历视图");
  });
});
