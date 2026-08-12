import type { Task, TaskStatus } from "./models";

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "completed", "cancelled"],
  in_progress: ["todo", "completed", "cancelled"],
  completed: ["todo"],
  cancelled: ["todo"],
};

export function canTransitionStatus(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function transitionTaskStatus(
  task: Task,
  next: TaskStatus,
  now = new Date().toISOString(),
): Task {
  if (!canTransitionStatus(task.status, next)) {
    throw new Error(`非法状态流转：${task.status} -> ${next}`);
  }
  return {
    ...task,
    status: next,
    completedAt: next === "completed" ? now : null,
    updatedAt: now,
  };
}

export function archiveTask(task: Task, now = new Date().toISOString()): Task {
  if (task.deletedAt) {
    throw new Error("任务在回收站中，无法归档");
  }
  if (task.archivedAt) {
    return task;
  }
  return { ...task, archivedAt: now, updatedAt: now };
}

export function unarchiveTask(task: Task, now = new Date().toISOString()): Task {
  if (!task.archivedAt) {
    return task;
  }
  return { ...task, archivedAt: null, updatedAt: now };
}

export function softDeleteTask(task: Task, now = new Date().toISOString()): Task {
  if (task.deletedAt) {
    return task;
  }
  return { ...task, deletedAt: now, updatedAt: now };
}

export function restoreTask(task: Task, now = new Date().toISOString()): Task {
  if (!task.deletedAt) {
    return task;
  }
  return { ...task, deletedAt: null, updatedAt: now };
}
