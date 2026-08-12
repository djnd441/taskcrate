import { describe, expect, it } from "vitest";
import { taskCreateSchema, taskUpdateSchema } from "./validation";

describe("任务校验", () => {
  it("接受合法创建输入并默认优先级", () => {
    const parsed = taskCreateSchema.safeParse({ title: "  新任务  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("新任务");
      expect(parsed.data.priority).toBe("none");
    }
  });

  it("拒绝空标题", () => {
    expect(taskCreateSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("允许更新时清空备注与截止时间", () => {
    const parsed = taskUpdateSchema.safeParse({ notes: null, dueAt: null });
    expect(parsed.success).toBe(true);
  });
});
