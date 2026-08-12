import { describe, expect, it } from "vitest";
import type { Project, Task } from "@task-manager/domain";
import { buildTaskRows, isTaskOverdue, rootProjectIdOf } from "./taskViewModel";

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

const project: Project = {
  id: "project-1",
  name: "工作",
  color: "#4F6EF7",
  sortOrder: 0,
  isArchived: false,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
};

describe("task view model", () => {
  it("returns flat rows without grouping", () => {
    const rows = buildTaskRows([makeTask()], [], "none");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "main", expanded: false });
  });

  it("keeps big and small tasks inside the main task container", () => {
    const tasks = [
      makeTask({ id: "main", taskKind: "main" }),
      makeTask({ id: "major", taskKind: "major", parentId: "main", sortOrder: 1 }),
      makeTask({
        id: "minor",
        taskKind: "minor",
        parentId: "major",
        sortOrder: 2,
      }),
    ];

    const collapsed = buildTaskRows(tasks, [], "none", () => false);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({ kind: "main", task: { id: "main" } });

    const expanded = buildTaskRows(tasks, [], "none", () => true);
    expect(expanded.map((row) => row.kind)).toEqual(["main", "task", "task"]);
    expect(expanded[1]).toMatchObject({ task: { id: "major" }, depth: 1 });
    expect(expanded[2]).toMatchObject({ task: { id: "minor" }, depth: 2 });
  });

  it("groups by status, project and due bucket", () => {
    const tasks = [
      makeTask({ id: "a", status: "todo", projectId: null, dueAt: null }),
      makeTask({
        id: "b",
        status: "in_progress",
        projectId: project.id,
        dueAt: "2026-08-10T10:00:00.000Z",
      }),
    ];

    const statusRows = buildTaskRows(tasks, [project], "status");
    expect(statusRows[0]).toMatchObject({ kind: "group", label: "待办" });

    const projectRows = buildTaskRows(tasks, [project], "project");
    expect(projectRows[0]).toMatchObject({ kind: "group", label: "工作" });
    expect(projectRows[2]).toMatchObject({ kind: "group", label: "收件箱" });

    const dueRows = buildTaskRows(tasks, [project], "due");
    expect(dueRows[0]).toMatchObject({ kind: "group", label: "截止 2026-08-10" });
    expect(dueRows[2]).toMatchObject({ kind: "group", label: "无截止时间" });
  });

  it("resolves project from the root main task", () => {
    const tasks = [
      makeTask({ id: "main", projectId: project.id, taskKind: "main" }),
      makeTask({ id: "major", parentId: "main", taskKind: "major" }),
    ];
    expect(rootProjectIdOf(tasks[1], tasks)).toBe(project.id);
    expect(rootProjectIdOf(tasks[0], tasks)).toBe(project.id);
  });

  it("marks only active past-due tasks as overdue", () => {
    const now = new Date("2026-08-06T00:00:00.000Z").getTime();
    expect(isTaskOverdue(makeTask({ dueAt: "2026-08-05T00:00:00.000Z" }), now)).toBe(true);
    expect(
      isTaskOverdue(makeTask({ dueAt: "2026-08-05T00:00:00.000Z", status: "completed" }), now),
    ).toBe(false);
    expect(isTaskOverdue(makeTask({ dueAt: "2026-08-10T00:00:00.000Z" }), now)).toBe(false);
    expect(isTaskOverdue(makeTask(), now)).toBe(false);
  });
});
