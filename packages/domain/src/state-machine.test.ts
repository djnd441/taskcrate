import { describe, expect, it } from "vitest";
import type { Task } from "./models";
import {
  archiveTask,
  canTransitionStatus,
  restoreTask,
  softDeleteTask,
  transitionTaskStatus,
  unarchiveTask,
} from "./state-machine";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "测试任务",
    notes: null,
    dueAt: null,
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
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

describe("任务状态机", () => {
  it("允许合法流转", () => {
    expect(canTransitionStatus("todo", "in_progress")).toBe(true);
    expect(canTransitionStatus("in_progress", "completed")).toBe(true);
    expect(canTransitionStatus("completed", "todo")).toBe(true);
    expect(canTransitionStatus("cancelled", "todo")).toBe(true);
  });

  it("拒绝非法流转", () => {
    expect(canTransitionStatus("todo", "todo")).toBe(true);
    expect(canTransitionStatus("completed", "cancelled")).toBe(false);
    expect(canTransitionStatus("cancelled", "in_progress")).toBe(false);
    expect(canTransitionStatus("cancelled", "completed")).toBe(false);
  });

  it("完成时写入完成时间，重新打开时清空", () => {
    const done = transitionTaskStatus(makeTask(), "completed", "2026-08-05T10:00:00.000Z");
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBe("2026-08-05T10:00:00.000Z");

    const reopened = transitionTaskStatus(done, "todo", "2026-08-05T11:00:00.000Z");
    expect(reopened.status).toBe("todo");
    expect(reopened.completedAt).toBeNull();
  });

  it("抛错并拒绝非法状态流转", () => {
    expect(() =>
      transitionTaskStatus(makeTask({ status: "cancelled" }), "completed"),
    ).toThrow(/非法状态流转/);
  });

  it("支持归档、软删除与恢复", () => {
    const archived = archiveTask(makeTask(), "2026-08-05T10:00:00.000Z");
    expect(archived.archivedAt).toBe("2026-08-05T10:00:00.000Z");
    expect(unarchiveTask(archived, "2026-08-05T11:00:00.000Z").archivedAt).toBeNull();

    const deleted = softDeleteTask(archived, "2026-08-05T12:00:00.000Z");
    expect(deleted.deletedAt).toBe("2026-08-05T12:00:00.000Z");
    expect(restoreTask(deleted, "2026-08-05T13:00:00.000Z").deletedAt).toBeNull();
  });

  it("禁止归档回收站中的任务", () => {
    expect(() =>
      archiveTask(makeTask({ deletedAt: "2026-08-05T10:00:00.000Z" })),
    ).toThrow(/回收站/);
  });
});
