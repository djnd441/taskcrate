import type { RepeatFrequency, Task, TaskCreateInput, TaskResource, TaskResourceInput } from "./models";

export const REPEAT_FREQUENCY_LABELS: Record<RepeatFrequency, string> = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  custom: "自定义",
};

export function nextRepeatDue(
  dueAt: string | null,
  frequency: RepeatFrequency,
  interval: number,
  endsAt: string | null,
  nowIso: string,
): string | null {
  if (frequency === "none") {
    return null;
  }
  const safeInterval = Math.max(1, Math.floor(interval) || 1);
  const now = new Date(nowIso).getTime();
  let next = dueAt ? new Date(dueAt) : new Date(nowIso);
  if (Number.isNaN(next.getTime())) {
    return null;
  }
  for (let step = 0; step < 120; step += 1) {
    if (frequency === "daily") {
      next = new Date(next.getTime() + safeInterval * 86400000);
    } else if (frequency === "weekly") {
      next = new Date(next.getTime() + safeInterval * 7 * 86400000);
    } else if (frequency === "monthly") {
      const monthIndex = next.getMonth() + safeInterval;
      next = new Date(next.getFullYear(), monthIndex, next.getDate(), next.getHours(), next.getMinutes(), next.getSeconds(), next.getMilliseconds());
    } else {
      next = new Date(next.getTime() + safeInterval * 86400000);
    }
    if (endsAt && next.getTime() > new Date(endsAt).getTime()) {
      return null;
    }
    if (next.getTime() > now) {
      return next.toISOString();
    }
  }
  return null;
}

export function resourceInputs(resources: TaskResource[]): TaskResourceInput[] {
  return resources.map((resource) => ({
    name: resource.name,
    kind: resource.kind,
    quantity: resource.quantity,
    unit: resource.unit,
    status: resource.status,
    notes: resource.notes,
    sortOrder: resource.sortOrder,
  }));
}

export function taskTreeToCreateInput(task: Task, children: Task[]): TaskCreateInput {
  return {
    title: task.title,
    notes: task.notes,
    dueAt: task.dueAt,
    repeatFrequency: task.repeatFrequency,
    repeatInterval: task.repeatInterval,
    repeatEndsAt: task.repeatEndsAt,
    assignee: task.assignee,
    department: task.department,
    startAt: task.startAt,
    doneCriteria: task.doneCriteria,
    budget: task.budget,
    priority: task.priority,
    projectId: task.projectId,
    tagIds: task.tagIds,
    taskKind: task.taskKind,
    resources: resourceInputs(task.resources),
    children: children
      .filter((child) => child.parentId === task.id)
      .map((child) => taskTreeToCreateInput(child, children)),
  };
}