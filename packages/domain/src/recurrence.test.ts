import { describe, expect, it } from "vitest";
import type { Task } from "./models";
import { nextRepeatDue, taskTreeToCreateInput } from "./recurrence";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "周期任务",
    notes: null,
    dueAt: "2026-08-08T09:00:00.000Z",
    repeatFrequency: "none",
    repeatInterval: 1,
    repeatEndsAt: null,
    assignee: null,
    department: null,
    startAt: null,
    doneCriteria: null,
    budget: null,
    priority: "none",
    status: "todo",
    projectId: null,
    tagIds: [],
    parentId: null,
    taskKind: "main",
    resources: [],
    sortOrder: 0,
    archivedAt: null,
    createdAt: "2026-08-08T08:00:00.000Z",
    updatedAt: "2026-08-08T08:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

describe("nextRepeatDue", () => {
  it("advances daily, weekly and custom intervals", () => {
    const now = "2026-08-08T10:00:00.000Z";
    expect(nextRepeatDue("2026-08-08T09:00:00.000Z", "daily", 1, null, now)).toBe(
      "2026-08-09T09:00:00.000Z",
    );
    expect(nextRepeatDue("2026-08-08T09:00:00.000Z", "weekly", 2, null, now)).toBe(
      "2026-08-22T09:00:00.000Z",
    );
    expect(nextRepeatDue("2026-08-08T09:00:00.000Z", "custom", 3, null, now)).toBe(
      "2026-08-11T09:00:00.000Z",
    );
  });

  it("skips past due dates until the next occurrence is in the future", () => {
    expect(
      nextRepeatDue("2026-08-01T09:00:00.000Z", "daily", 1, null, "2026-08-08T10:00:00.000Z"),
    ).toBe("2026-08-09T09:00:00.000Z");
  });

  it("respects the repeat end date", () => {
    expect(
      nextRepeatDue(
        "2026-08-08T09:00:00.000Z",
        "daily",
        1,
        "2026-08-08T08:00:00.000Z",
        "2026-08-08T10:00:00.000Z",
      ),
    ).toBeNull();
  });
});

describe("taskTreeToCreateInput", () => {
  it("clones the task tree with children and resources", () => {
    const main = makeTask({
      id: "main",
      title: "主任务",
      repeatFrequency: "weekly",
      resources: [
        {
          id: "r1",
          name: "电脑",
          kind: "tool",
          quantity: "1",
          unit: "台",
          status: "ready",
          notes: "",
          sortOrder: 0,
          createdAt: "2026-08-08T08:00:00.000Z",
          updatedAt: "2026-08-08T08:00:00.000Z",
        },
      ],
    });
    const major = makeTask({
      id: "major",
      title: "大任务",
      taskKind: "major",
      parentId: "main",
      sortOrder: 1,
    });

    const input = taskTreeToCreateInput(main, [main, major]);
    expect(input.title).toBe("主任务");
    expect(input.repeatFrequency).toBe("weekly");
    expect(input.children).toHaveLength(1);
    expect(input.children?.[0].title).toBe("大任务");
    expect(input.resources?.[0].name).toBe("电脑");
  });
});