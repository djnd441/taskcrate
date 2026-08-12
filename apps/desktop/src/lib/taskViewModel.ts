import type { Project, Task, TaskStatus } from "@task-manager/domain";

export type TaskGroupBy = "none" | "status" | "project" | "due";

export type TaskRow =
  | { key: string; kind: "group"; label: string; count: number }
  | {
      key: string;
      kind: "main";
      task: Task;
      expanded: boolean;
      childCount: number;
    }
  | { key: string; kind: "task"; task: Task; depth: number };

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待办",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled"];

export function isTaskOverdue(task: Task, nowMs: number): boolean {
  return Boolean(
    task.dueAt &&
    task.status !== "completed" &&
    task.status !== "cancelled" &&
    !task.archivedAt &&
    !task.deletedAt &&
    new Date(task.dueAt).getTime() < nowMs,
  );
}

export function buildTaskRows(
  tasks: Task[],
  projects: Project[],
  groupBy: TaskGroupBy,
  isExpanded: (id: string) => boolean = () => false,
): TaskRow[] {
  if (groupBy === "none") {
    return buildHierarchyRows(tasks, isExpanded);
  }

  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = bucketKeyFor(task, tasks, groupBy);
    const list = buckets.get(key);
    if (list) {
      list.push(task);
    } else {
      buckets.set(key, [task]);
    }
  }

  const orderedKeys = [...buckets.keys()].sort((a, b) => {
    if (groupBy === "status") {
      return STATUS_ORDER.indexOf(a as TaskStatus) - STATUS_ORDER.indexOf(b as TaskStatus);
    }
    if (groupBy === "project") {
      if (a === "__inbox") {
        return 1;
      }
      if (b === "__inbox") {
        return -1;
      }
      return a.localeCompare(b, "zh-CN");
    }
    if (a === "__none") {
      return 1;
    }
    if (b === "__none") {
      return -1;
    }
    return a.localeCompare(b);
  });

  return orderedKeys.flatMap((key) => {
    const groupTasks = buckets.get(key) ?? [];
    const label =
      groupBy === "status"
        ? STATUS_LABELS[key as TaskStatus]
        : groupBy === "project"
          ? projectName(projects, key === "__inbox" ? null : key)
          : key === "__none"
            ? "无截止时间"
            : `截止 ${key}`;
    return [
      { key: `group-${key}`, kind: "group" as const, label, count: groupTasks.length },
      ...buildHierarchyRows(groupTasks, isExpanded),
    ];
  });
}

function buildHierarchyRows(tasks: Task[], isExpanded: (id: string) => boolean): TaskRow[] {
  const roots = tasks
    .filter((task) => task.taskKind === "main" || !task.parentId)
    .sort(compareTasks);
  const rows: TaskRow[] = [];

  for (const root of roots) {
    const directChildren = tasks.filter((task) => task.parentId === root.id);
    const majors = directChildren.filter((task) => task.taskKind === "major").sort(compareTasks);
    const expanded = isExpanded(root.id);
    rows.push({
      key: `main-${root.id}`,
      kind: "main",
      task: root,
      expanded,
      childCount: directChildren.length,
    });
    if (!expanded) {
      continue;
    }
    for (const major of majors) {
      rows.push({ key: `task-${major.id}`, kind: "task", task: major, depth: 1 });
      const minors = tasks.filter((task) => task.parentId === major.id).sort(compareTasks);
      for (const minor of minors) {
        rows.push({ key: `task-${minor.id}`, kind: "task", task: minor, depth: 2 });
      }
    }
    const orphanMinors = directChildren.filter(
      (task) => task.taskKind === "minor" && !majors.some((major) => major.id === task.parentId),
    );
    for (const orphan of orphanMinors) {
      rows.push({ key: `task-${orphan.id}`, kind: "task", task: orphan, depth: 1 });
    }
  }

  const knownIds = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    if (task.parentId && !knownIds.has(task.parentId)) {
      rows.push({ key: `task-${task.id}`, kind: "task", task, depth: 1 });
    }
  }
  return rows;
}

function bucketKeyFor(task: Task, tasks: Task[], groupBy: Exclude<TaskGroupBy, "none">): string {
  const root = rootMainOf(task, tasks) ?? task;
  if (groupBy === "status") {
    return root.status;
  }
  if (groupBy === "project") {
    return root.projectId ?? "__inbox";
  }
  return root.dueAt?.slice(0, 10) ?? "__none";
}

function rootMainOf(task: Task, tasks: Task[]): Task | null {
  let current = task;
  while (current.parentId) {
    const parent = tasks.find((item) => item.id === current.parentId);
    if (!parent) {
      return null;
    }
    current = parent;
  }
  return current.taskKind === "main" ? current : null;
}

export function rootProjectIdOf(task: Task, tasks: Task[]): string | null {
  return (rootMainOf(task, tasks) ?? task).projectId;
}

function compareTasks(a: Task, b: Task): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

function projectName(projects: Project[], projectId: string | null): string {
  if (!projectId) {
    return "收件箱";
  }
  return projects.find((project) => project.id === projectId)?.name ?? "未分类";
}
