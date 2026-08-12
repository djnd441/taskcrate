import type {
  BackupInfo,
  BackupSummary,
  AiConversation,
  AiConversationSummary,
  AuditLog,
  ExportResult,
  ImportResult,
  Project,
  ProjectMember,
  Settings,
  Tag,
  Task,
  TaskComment,
  TaskCreateInput,
  TaskAttachment,
  LibraryResource,
  TaskFilter,
  TaskPage,
  TaskSort,
  TaskTemplate,
  TaskPriority,
  UpdateStatus,
} from "@task-manager/domain";
import { nextRepeatDue, taskTreeToCreateInput } from "@task-manager/domain";
import {
  archiveTask as archiveTaskState,
  restoreTask as restoreTaskState,
  softDeleteTask as softDeleteTaskState,
  transitionTaskStatus,
  unarchiveTask as unarchiveTaskState,
} from "@task-manager/domain";
import type { AppAdapters } from "./types";

const now = () => new Date().toISOString();

const defaultProjects: Project[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "收件箱",
    color: "#6B7280",
    sortOrder: 0,
    isArchived: false,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "工作",
    color: "#4F6EF7",
    sortOrder: 1,
    isArchived: false,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "个人",
    color: "#16A34A",
    sortOrder: 2,
    isArchived: false,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "学习",
    color: "#D97706",
    sortOrder: 3,
    isArchived: false,
    createdAt: now(),
    updatedAt: now(),
  },
];

const defaultTags: Tag[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "重要",
    color: "#E5484D",
    createdAt: now(),
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "紧急",
    color: "#F76B15",
    createdAt: now(),
  },
];

const defaultSettings: Settings = {
  theme: "system",
  language: "zh-CN",
  remindersEnabled: true,
  remindMinutes: 15,
  reminderSoundEnabled: true,
  remindWhenClosed: true,
  backupIntervalHours: 24,
  dataDirectory: null,
  lastBackupAt: null,
  aiProvider: "off",
  aiBaseUrl: "",
  aiModel: "",
  aiTemperature: 0.7,
  aiToolsEnabled: true,
  aiConfirmDestructive: true,
  aiApiKeyConfigured: true,
  webhookDingTalk: "",
  webhookWeCom: "",
  webhookFeishu: "",
  webhookDingTalkConfigured: false,
  webhookWeComConfigured: false,
  webhookFeishuConfigured: false,
  schemaVersion: 1,
};

function seedTasks(): Task[] {
  const created = now();
  return [
    {
      id: "mock-task-1",
      title: "整理季度计划",
      notes: "拆分到每周目标",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      repeatFrequency: "none" as const,
      repeatInterval: 1,
      repeatEndsAt: null,
      assignee: null,
      department: null,
      startAt: null,
      doneCriteria: null,
      budget: null,
      priority: "high",
      status: "in_progress",
      projectId: defaultProjects[1].id,
      tagIds: [defaultTags[0].id],
      parentId: null,
      taskKind: "main",
      resources: [],
      sortOrder: 0,
      archivedAt: null,
      createdAt: created,
      updatedAt: created,
      completedAt: null,
      deletedAt: null,
      schemaVersion: 1,
    },
    {
      id: "mock-task-2",
      title: "预约体检",
      notes: null,
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      repeatFrequency: "none" as const,
      repeatInterval: 1,
      repeatEndsAt: null,
      assignee: null,
      department: null,
      startAt: null,
      doneCriteria: null,
      budget: null,
      priority: "medium",
      status: "todo",
      projectId: defaultProjects[2].id,
      tagIds: [],
      parentId: null,
      taskKind: "main",
      resources: [],
      sortOrder: 1,
      archivedAt: null,
      createdAt: created,
      updatedAt: created,
      completedAt: null,
      deletedAt: null,
      schemaVersion: 1,
    },
    {
      id: "mock-task-3",
      title: "复习 Rust 生命周期",
      notes: "所有权与借用规则",
      dueAt: null,
      repeatFrequency: "none" as const,
      repeatInterval: 1,
      repeatEndsAt: null,
      assignee: null,
      department: null,
      startAt: null,
      doneCriteria: null,
      budget: null,
      priority: "low",
      status: "completed",
      projectId: defaultProjects[3].id,
      tagIds: [defaultTags[0].id],
      parentId: null,
      taskKind: "main",
      resources: [],
      sortOrder: 2,
      archivedAt: null,
      createdAt: created,
      updatedAt: created,
      completedAt: created,
      deletedAt: null,
      schemaVersion: 1,
    },
  ];
}

const projects = [...defaultProjects];
const tags = [...defaultTags];
const tasks = seedTasks();
let settings = { ...defaultSettings };
const backups: BackupInfo[] = [];
const aiConversations: AiConversation[] = [];
interface MockLibraryResource extends LibraryResource {
  file?: File;
}

const mockAttachments: TaskAttachment[] = [];
const mockLibraryResources: MockLibraryResource[] = [];
let libraryIdCounter = 0;

function libraryKindOf(name: string, mimeType: string): LibraryResource["kind"] {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md)$/i.test(name)) {
    return "document";
  }
  return "other";
}
const mockTemplates: TaskTemplate[] = [];
const mockAuditLogs: AuditLog[] = [];
const mockComments: TaskComment[] = [];
const mockMembers: ProjectMember[] = [];
let idCounter = 100;
let aiConversationId = 0;
let attachmentIdCounter = 0;

const benchmarkCount = Number(
  new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("benchmark"),
);
if (Number.isFinite(benchmarkCount) && benchmarkCount > 0) {
  tasks.splice(0, tasks.length);
  const timestamp = now();
  const inboxId = defaultProjects[0].id;
  for (let index = 0; index < benchmarkCount; index += 1) {
    tasks.push({
      id: `benchmark-${index}`,
      title: `任务 ${String(index).padStart(5, "0")}`,
      notes: index % 100 === 0 ? `备注 ${index}` : null,
      dueAt: index % 50 === 0 ? new Date(Date.now() + index * 60_000).toISOString() : null,
      repeatFrequency: "none" as const,
      repeatInterval: 1,
      repeatEndsAt: null,
      assignee: null,
      department: null,
      startAt: null,
      doneCriteria: null,
      budget: null,
      priority: "none",
      status: index % 4 === 0 ? "in_progress" : "todo",
      projectId: index % 5 === 0 ? null : inboxId,
      tagIds: [],
      parentId: null,
      taskKind: "main",
      resources: [],
      sortOrder: index,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      deletedAt: null,
      schemaVersion: 1,
    });
  }
}

interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  projects: Project[];
  tags: Tag[];
  tasks: Task[];
  settings?: Settings;
}

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    tagIds: [...task.tagIds],
    resources: task.resources.map((resource) => ({ ...resource })),
  };
}

function cloneAiConversation(conversation: AiConversation): AiConversation {
  return JSON.parse(JSON.stringify(conversation)) as AiConversation;
}

function findTask(id: string): Task {
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    throw new Error(`任务不存在：${id}`);
  }
  return task;
}

function ensureProject(id: string | null): void {
  if (id && !projects.some((project) => project.id === id)) {
    throw new Error(`项目不存在：${id}`);
  }
}

function descendantIds(id: string): string[] {
  const result: string[] = [];
  const queue = tasks.filter((task) => task.parentId === id).map((task) => task.id);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    result.push(current);
    queue.push(...tasks.filter((task) => task.parentId === current).map((task) => task.id));
  }
  return result;
}

function cascadeProjectToDescendants(id: string, projectId: string | null): void {
  const timestamp = now();
  for (const childId of descendantIds(id)) {
    const task = findTask(childId);
    task.projectId = projectId;
    task.updatedAt = timestamp;
  }
}

function applySubtreeState(id: string, transform: (task: Task, timestamp: string) => Task): void {
  const timestamp = now();
  for (const childId of descendantIds(id)) {
    const task = findTask(childId);
    Object.assign(task, transform(task, timestamp));
  }
}

function removeTaskSubtree(id: string): number {
  const ids = new Set([id, ...descendantIds(id)]);
  let count = 0;
  for (const target of ids) {
    const index = tasks.findIndex((task) => task.id === target);
    if (index !== -1) {
      tasks.splice(index, 1);
      count += 1;
    }
  }
  return count;
}

function ensureTags(ids: string[]): void {
  for (const id of ids) {
    if (!tags.some((tag) => tag.id === id)) {
      throw new Error(`标签不存在：${id}`);
    }
  }
}

function matchesFilter(task: Task, filter: TaskFilter): boolean {
  const query = filter.query?.trim().toLowerCase();
  if (query) {
    const haystack = `${task.title} ${task.notes ?? ""}`.toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }
  if (filter.statuses?.length && !filter.statuses.includes(task.status)) {
    return false;
  }
  if (filter.priorities?.length && !filter.priorities.includes(task.priority)) {
    return false;
  }
  if (filter.projectId !== undefined && (filter.projectId ?? null) !== task.projectId) {
    return false;
  }
  if (filter.tagIds?.length && !filter.tagIds.every((id) => task.tagIds.includes(id))) {
    return false;
  }
  if (filter.dueFrom && (!task.dueAt || task.dueAt < filter.dueFrom)) {
    return false;
  }
  if (filter.dueUntil && (!task.dueAt || task.dueAt > filter.dueUntil)) {
    return false;
  }
  if (!filter.includeArchived && task.archivedAt) {
    return false;
  }
  if (!filter.includeDeleted && task.deletedAt) {
    return false;
  }
  return true;
}

function sortTasks(list: Task[], sort: TaskSort): Task[] {
  const priorityRank: Record<Task["priority"], number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let result = 0;
    switch (sort.field) {
      case "dueAt":
        result = (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
        break;
      case "priority":
        result = priorityRank[a.priority] - priorityRank[b.priority];
        break;
      case "sortOrder":
        result = a.sortOrder - b.sortOrder;
        break;
      case "updatedAt":
        result = a.updatedAt.localeCompare(b.updatedAt);
        break;
      default:
        result = a.createdAt.localeCompare(b.createdAt);
    }
    if (result === 0) {
      result = a.createdAt.localeCompare(b.createdAt);
    }
    return result * direction;
  });
}

function taskPage(list: Task[], offset: number, limit: number): TaskPage {
  return {
    items: list.slice(offset, offset + limit),
    total: list.length,
    offset,
    limit,
  };
}

function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildPayload(): BackupPayload {
  return {
    schemaVersion: 1,
    exportedAt: now(),
    projects: projects.map((project) => ({ ...project })),
    tags: tags.map((tag) => ({ ...tag })),
    tasks: tasks.map((task) => cloneTask(task)),
    settings: { ...settings },
  };
}

function importPayload(payload: BackupPayload, replace: boolean): ImportResult {
  if (
    !Array.isArray(payload.projects) ||
    !Array.isArray(payload.tags) ||
    !Array.isArray(payload.tasks)
  ) {
    throw new Error("JSON 结构无效：缺少 projects、tags 或 tasks");
  }
  if (replace) {
    projects.splice(0, projects.length);
    tags.splice(0, tags.length);
    tasks.splice(0, tasks.length);
  }

  let importedProjects = 0;
  for (const project of payload.projects) {
    if (!project.name?.trim()) {
      throw new Error("导入失败：项目名称不能为空");
    }
    if (!projects.some((item) => item.id === project.id)) {
      projects.push({ ...project, name: project.name.trim() });
      importedProjects += 1;
    }
  }

  let importedTags = 0;
  for (const tag of payload.tags) {
    if (!tag.name?.trim()) {
      throw new Error("导入失败：标签名称不能为空");
    }
    if (!tags.some((item) => item.id === tag.id)) {
      tags.push({ ...tag, name: tag.name.trim() });
      importedTags += 1;
    }
  }

  let importedTasks = 0;
  for (const task of payload.tasks) {
    if (!task.title?.trim()) {
      throw new Error(`导入失败：任务 ${task.id} 标题不能为空`);
    }
    if (tasks.some((item) => item.id === task.id)) {
      continue;
    }
    const projectId =
      task.projectId && projects.some((project) => project.id === task.projectId)
        ? task.projectId
        : null;
    const tagIds = (task.tagIds ?? []).filter((id) => tags.some((tag) => tag.id === id));
    tasks.push({
      ...task,
      title: task.title.trim(),
      projectId,
      tagIds,
      parentId: task.parentId ?? null,
      taskKind: task.taskKind ?? "main",
      resources: Array.isArray(task.resources)
        ? task.resources.map((resource) => ({ ...resource }))
        : [],
    });
    importedTasks += 1;
  }

  if (payload.settings) {
    settings = { ...settings, ...payload.settings, schemaVersion: 1 };
  }

  return {
    projects: importedProjects,
    tags: importedTags,
    tasks: importedTasks,
  };
}

function csvValue(value: string): string {
  return value.includes(",") || value.includes('"') || value.includes("\n")
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

function makeMockTask(input: TaskCreateInput, parentId: string | null, id: string): Task {
  const title = input.title.trim();
  if (!title) {
    throw new Error("任务标题不能为空");
  }
  ensureProject(input.projectId ?? null);
  ensureTags(input.tagIds ?? []);
  const timestamp = now();
  return {
    id,
    title,
    notes: input.notes ?? "",
    dueAt: input.dueAt ?? null,
    repeatFrequency: input.repeatFrequency ?? "none",
    repeatInterval: input.repeatInterval ?? 1,
    repeatEndsAt: input.repeatEndsAt ?? null,
    assignee: input.assignee ?? null,
    department: input.department ?? null,
    startAt: input.startAt ?? null,
    doneCriteria: input.doneCriteria ?? null,
    budget: input.budget ?? null,
    priority: input.priority ?? "none",
    status: input.status ?? "todo",
    projectId: input.projectId ?? null,
    tagIds: [...(input.tagIds ?? [])],
    parentId,
    taskKind: input.taskKind ?? "main",
    resources: (input.resources ?? []).map((resource, index) => ({
      id: nextId("mock-resource"),
      name: resource.name,
      kind: resource.kind ?? "tool",
      quantity: resource.quantity ?? "",
      unit: resource.unit ?? "",
      status: resource.status ?? "pending",
      notes: resource.notes ?? "",
      sortOrder: resource.sortOrder ?? index,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    sortOrder: input.sortOrder ?? tasks.length,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: input.status === "completed" ? timestamp : null,
    deletedAt: null,
    schemaVersion: 1,
  };
}

function createMockTaskTree(input: TaskCreateInput, parentId: string | null): Task {
  const parent = parentId ? findTask(parentId) : null;
  const task = makeMockTask(
    { ...input, projectId: input.projectId ?? parent?.projectId ?? null },
    parentId,
    nextId("mock-task"),
  );
  tasks.push(task);
  for (const child of input.children ?? []) {
    createMockTaskTree(child, task.id);
  }
  return cloneTask(task);
}

export const mockAdapter: AppAdapters = {
  tasks: {
    async get(id) {
      const task = tasks.find((item) => item.id === id);
      return task ? cloneTask(task) : null;
    },
    async list(
      filter = {},
      sort = { field: "createdAt", direction: "asc" },
      offset = 0,
      limit = 100,
    ) {
      const safeLimit = limit > 0 ? Math.min(limit, 10000) : 100;
      const safeOffset = Math.max(offset, 0);
      const filtered = tasks.filter((task) => matchesFilter(task, filter));
      return taskPage(sortTasks(filtered, sort), safeOffset, safeLimit);
    },
    async create(input) {
      return createMockTaskTree(input, input.parentId ?? null);
    },
    async update(id, input) {
      const task = findTask(id);
      if (task.deletedAt) {
        throw new Error("任务在回收站中，无法编辑");
      }
      const projectChanged = input.projectId !== undefined;
      const updated = cloneTask(task);
      if (input.title !== undefined) {
        const title = input.title.trim();
        if (!title) {
          throw new Error("任务标题不能为空");
        }
        updated.title = title;
      }
      if (input.notes !== undefined) {
        updated.notes = input.notes;
      }
      if (input.dueAt !== undefined) {
        updated.dueAt = input.dueAt;
      }
      if (input.repeatFrequency !== undefined) {
        updated.repeatFrequency = input.repeatFrequency;
      }
      if (input.repeatInterval !== undefined) {
        updated.repeatInterval = input.repeatInterval;
      }
      if (input.repeatEndsAt !== undefined) {
        updated.repeatEndsAt = input.repeatEndsAt;
      }
      if (input.assignee !== undefined) {
        updated.assignee = input.assignee;
      }
      if (input.department !== undefined) {
        updated.department = input.department;
      }
      if (input.startAt !== undefined) {
        updated.startAt = input.startAt;
      }
      if (input.doneCriteria !== undefined) {
        updated.doneCriteria = input.doneCriteria;
      }
      if (input.budget !== undefined) {
        updated.budget = input.budget;
      }
      if (input.priority !== undefined) {
        updated.priority = input.priority;
      }
      if (input.projectId !== undefined) {
        ensureProject(input.projectId);
        updated.projectId = input.projectId;
      }
      if (input.tagIds !== undefined) {
        ensureTags(input.tagIds);
        updated.tagIds = [...input.tagIds];
      }
      if (input.parentId !== undefined) {
        if (input.parentId && !tasks.some((item) => item.id === input.parentId)) {
          throw new Error(`父任务不存在：${input.parentId}`);
        }
        updated.parentId = input.parentId;
      }
      if (input.taskKind !== undefined) {
        updated.taskKind = input.taskKind;
      }
      if (input.resources !== undefined) {
        const timestamp = now();
        updated.resources = input.resources.map((resource, index) => ({
          id: nextId("mock-resource"),
          name: resource.name,
          kind: resource.kind ?? "tool",
          quantity: resource.quantity ?? "",
          unit: resource.unit ?? "",
          status: resource.status ?? "pending",
          notes: resource.notes ?? "",
          sortOrder: resource.sortOrder ?? index,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
      }
      if (input.sortOrder !== undefined) {
        updated.sortOrder = input.sortOrder;
      }
      updated.updatedAt = now();
      Object.assign(findTask(id), updated);
      if (projectChanged) {
        cascadeProjectToDescendants(id, updated.projectId);
      }
      return cloneTask(findTask(id));
    },
    async transitionStatus(id, status) {
      const task = findTask(id);
      if (task.deletedAt) {
        throw new Error("任务在回收站中，无法变更状态");
      }
      const updated = transitionTaskStatus(task, status, now());
      Object.assign(findTask(id), updated);
      if (
        updated.status === "completed" &&
        updated.taskKind === "main" &&
        updated.repeatFrequency !== "none"
      ) {
        const nextDue = nextRepeatDue(
          updated.dueAt,
          updated.repeatFrequency,
          updated.repeatInterval,
          updated.repeatEndsAt,
          now(),
        );
        if (nextDue) {
          const input = taskTreeToCreateInput(updated, tasks);
          createMockTaskTree({ ...input, dueAt: nextDue, status: "todo" }, null);
        }
      }
      return cloneTask(findTask(id));
    },
    async archive(id) {
      const task = findTask(id);
      Object.assign(findTask(id), archiveTaskState(task, now()));
      applySubtreeState(id, archiveTaskState);
      return cloneTask(findTask(id));
    },
    async unarchive(id) {
      const task = findTask(id);
      Object.assign(findTask(id), unarchiveTaskState(task, now()));
      applySubtreeState(id, unarchiveTaskState);
      return cloneTask(findTask(id));
    },
    async softDelete(id) {
      const task = findTask(id);
      Object.assign(findTask(id), softDeleteTaskState(task, now()));
      applySubtreeState(id, softDeleteTaskState);
      return cloneTask(findTask(id));
    },
    async restore(id) {
      const task = findTask(id);
      Object.assign(findTask(id), restoreTaskState(task, now()));
      applySubtreeState(id, restoreTaskState);
      return cloneTask(findTask(id));
    },
    async hardDelete(id) {
      if (!tasks.some((item) => item.id === id)) {
        throw new Error(`任务不存在：${id}`);
      }
      removeTaskSubtree(id);
    },
  },
  projects: {
    async list(includeArchived = false) {
      return projects
        .filter((project) => includeArchived || !project.isArchived)
        .map((project) => ({ ...project }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async get(id) {
      const project = projects.find((item) => item.id === id);
      return project ? { ...project } : null;
    },
    async create(input) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("项目名称不能为空");
      }
      const timestamp = now();
      const project: Project = {
        id: nextId("mock-project"),
        name,
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? projects.length,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      projects.push(project);
      return { ...project };
    },
    async update(id, input) {
      const project = projects.find((item) => item.id === id);
      if (!project) {
        throw new Error(`项目不存在：${id}`);
      }
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) {
          throw new Error("项目名称不能为空");
        }
        project.name = name;
      }
      if (input.color !== undefined) {
        project.color = input.color;
      }
      if (input.sortOrder !== undefined) {
        project.sortOrder = input.sortOrder;
      }
      if (input.isArchived !== undefined) {
        project.isArchived = input.isArchived;
      }
      project.updatedAt = now();
      return { ...project };
    },
    async archive(id) {
      return this.update(id, { isArchived: true });
    },
    async delete(id) {
      const index = projects.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error(`项目不存在：${id}`);
      }
      projects.splice(index, 1);
    },
  },
  tags: {
    async list() {
      return tags.map((tag) => ({ ...tag }));
    },
    async get(id) {
      const tag = tags.find((item) => item.id === id);
      return tag ? { ...tag } : null;
    },
    async create(input) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("标签名称不能为空");
      }
      if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("标签名称已存在");
      }
      const tag: Tag = {
        id: nextId("mock-tag"),
        name,
        color: input.color ?? null,
        createdAt: now(),
      };
      tags.push(tag);
      return { ...tag };
    },
    async update(id, input) {
      const tag = tags.find((item) => item.id === id);
      if (!tag) {
        throw new Error(`标签不存在：${id}`);
      }
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) {
          throw new Error("标签名称不能为空");
        }
        if (tags.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
          throw new Error("标签名称已存在");
        }
        tag.name = name;
      }
      if (input.color !== undefined) {
        tag.color = input.color;
      }
      return { ...tag };
    },
    async delete(id) {
      const index = tags.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error(`标签不存在：${id}`);
      }
      tags.splice(index, 1);
      for (const task of tasks) {
        task.tagIds = task.tagIds.filter((tagId) => tagId !== id);
      }
    },
  },
  settings: {
    async get() {
      return { ...settings };
    },
    async update(patch) {
      settings = { ...settings, ...patch };
      return { ...settings };
    },
  },
  ai: {
    async chat(messages) {
      const lastUser = [...messages].reverse().find((message) => message.role === "user");
      const content = lastUser?.content?.trim() ?? "";
      if (/创建任务|创建主任务/.test(content)) {
        const title =
          content.replace(/.*?(创建任务|创建主任务)\s*[:：]?\s*/, "").trim() || "AI 演示任务";
        await mockAdapter.tasks.create({ title });
        return { text: `已创建任务：${title}`, toolCalls: [] };
      }
      return {
        text: "演示模式：当前未连接真实模型，可以到设置中配置本地或云端模型。",
        toolCalls: [],
      };
    },
    async executeTool(name, args, confirmed) {
      void confirmed;
      if (name === "create_task") {
        const task = await mockAdapter.tasks.create(args as unknown as TaskCreateInput);
        return JSON.stringify(task);
      }
      throw new Error(`演示模式暂不支持工具：${name}`);
    },
    async testConnection() {
      return {
        ok: true,
        latencyMs: 0,
        model: "演示模式",
        message: "演示连接成功",
      };
    },
    async saveApiKey() {
      return true;
    },
    async listConversations() {
      return aiConversations
        .map((conversation): AiConversationSummary => ({
          id: conversation.id,
          title: conversation.title,
          provider: conversation.provider,
          model: conversation.model,
          messageCount: conversation.messages.length,
          updatedAt: conversation.updatedAt,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getConversation(id) {
      const conversation = aiConversations.find((item) => item.id === id);
      return conversation ? cloneAiConversation(conversation) : null;
    },
    async createConversation(provider, model) {
      const timestamp = now();
      aiConversationId += 1;
      const conversation: AiConversation = {
        id: `ai-conversation-${aiConversationId}`,
        title: "新对话",
        provider,
        model,
        messages: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      aiConversations.push(conversation);
      return cloneAiConversation(conversation);
    },
    async saveConversation(conversation) {
      const index = aiConversations.findIndex((item) => item.id === conversation.id);
      const saved = cloneAiConversation({
        ...conversation,
        title: conversation.title.trim() || "新对话",
        updatedAt: now(),
      });
      if (index === -1) {
        aiConversations.push(saved);
      } else {
        aiConversations[index] = saved;
      }
      return cloneAiConversation(saved);
    },
    async deleteConversation(id) {
      const index = aiConversations.findIndex((item) => item.id === id);
      if (index !== -1) {
        aiConversations.splice(index, 1);
      }
    },
  },
  attachments: {
    async pickFiles() {
      return [];
    },
    async list(taskId) {
      return mockAttachments
        .filter((item) => item.taskId === taskId)
        .map((item) => JSON.parse(JSON.stringify(item)) as TaskAttachment);
    },
    async counts(taskIds) {
      const counts: Record<string, number> = {};
      for (const taskId of taskIds) {
        counts[taskId] = mockAttachments.filter((item) => item.taskId === taskId).length;
      }
      return counts;
    },
    async add(taskId, draft) {
      const timestamp = now();
      attachmentIdCounter += 1;
      const attachment: TaskAttachment = {
        id: `mock-attachment-${attachmentIdCounter}`,
        taskId,
        name: draft.name,
        mimeType: draft.file?.type ?? "",
        sizeBytes: draft.sizeBytes,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      mockAttachments.push(attachment);
      return JSON.parse(JSON.stringify(attachment)) as TaskAttachment;
    },
    async remove(id) {
      const index = mockAttachments.findIndex((item) => item.id === id);
      if (index !== -1) {
        mockAttachments.splice(index, 1);
      }
    },
    async package(taskId) {
      const count = mockAttachments.filter((item) => item.taskId === taskId).length;
      return count > 0 ? "演示模式：打包功能需要桌面端" : "演示模式：暂无附件可打包";
    },
  },
  library: {
    async list() {
      return mockLibraryResources.map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        kind: item.kind,
        sizeBytes: item.sizeBytes,
        storagePath: item.storagePath,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    },
    async pickFile() {
      return [];
    },
    async addDraft(draft) {
      const timestamp = now();
      libraryIdCounter += 1;
      const resource: MockLibraryResource = {
        id: `mock-library-${libraryIdCounter}`,
        name: draft.name,
        mimeType: draft.file?.type ?? "",
        kind: libraryKindOf(draft.name, draft.file?.type ?? ""),
        sizeBytes: draft.sizeBytes,
        storagePath: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        file: draft.file,
      };
      mockLibraryResources.push(resource);
      return {
        id: resource.id,
        name: resource.name,
        mimeType: resource.mimeType,
        kind: resource.kind,
        sizeBytes: resource.sizeBytes,
        storagePath: resource.storagePath,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
      };
    },
    async remove(id) {
      const index = mockLibraryResources.findIndex((item) => item.id === id);
      if (index !== -1) {
        mockLibraryResources.splice(index, 1);
      }
    },
    async copyToTask(libraryId, taskId) {
      const item = mockLibraryResources.find((resource) => resource.id === libraryId);
      if (!item) {
        throw new Error("素材不存在");
      }
      const timestamp = now();
      attachmentIdCounter += 1;
      const attachment: TaskAttachment = {
        id: `mock-attachment-${attachmentIdCounter}`,
        taskId,
        name: item.name,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      mockAttachments.push(attachment);
      return JSON.parse(JSON.stringify(attachment)) as TaskAttachment;
    },
  },
  comments: {
    async list(taskId) {
      return mockComments
        .filter((item) => item.taskId === taskId)
        .map((item) => JSON.parse(JSON.stringify(item)) as TaskComment)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async add(input) {
      const timestamp = now();
      const comment: TaskComment = {
        id: nextId("mock-comment"),
        taskId: input.taskId,
        author: input.author.trim(),
        content: input.content.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      mockComments.push(comment);
      return JSON.parse(JSON.stringify(comment)) as TaskComment;
    },
    async remove(id) {
      const index = mockComments.findIndex((item) => item.id === id);
      if (index !== -1) {
        mockComments.splice(index, 1);
      }
    },
  },
  projectMembers: {
    async list(projectId) {
      return mockMembers
        .filter((item) => item.projectId === projectId)
        .map((item) => JSON.parse(JSON.stringify(item)) as ProjectMember)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async add(input) {
      const member: ProjectMember = {
        id: nextId("mock-member"),
        projectId: input.projectId,
        name: input.name.trim(),
        email: input.email.trim(),
        role: input.role,
        createdAt: now(),
      };
      mockMembers.push(member);
      return JSON.parse(JSON.stringify(member)) as ProjectMember;
    },
    async remove(id) {
      const index = mockMembers.findIndex((item) => item.id === id);
      if (index !== -1) {
        mockMembers.splice(index, 1);
      }
    },
  },
  audit: {
    async list(limit = 200) {
      return mockAuditLogs
        .map((log) => JSON.parse(JSON.stringify(log)) as AuditLog)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.min(limit, 2000));
    },
  },
  templates: {
    async list() {
      return mockTemplates
        .map((template) => JSON.parse(JSON.stringify(template)) as TaskTemplate)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(id) {
      const template = mockTemplates.find((item) => item.id === id);
      return template ? (JSON.parse(JSON.stringify(template)) as TaskTemplate) : null;
    },
    async create(input) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("模板名称不能为空");
      }
      if (input.tasks.length !== 1 || input.tasks[0].taskKind !== "main") {
        throw new Error("模板根节点必须是一个主任务");
      }
      if (input.projectId) {
        ensureProject(input.projectId);
      }
      const timestamp = now();
      const template: TaskTemplate = {
        id: nextId("mock-template"),
        name,
        projectId: input.projectId ?? null,
        tasks: JSON.parse(JSON.stringify(input.tasks)) as TaskCreateInput[],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      mockTemplates.push(template);
      return JSON.parse(JSON.stringify(template)) as TaskTemplate;
    },
    async delete(id) {
      const index = mockTemplates.findIndex((item) => item.id === id);
      if (index !== -1) {
        mockTemplates.splice(index, 1);
      }
    },
    async exportJsonText(templateId) {
      const template = mockTemplates.find((item) => item.id === templateId);
      if (!template) {
        throw new Error("模板不存在");
      }
      return JSON.stringify(
        { schemaVersion: 1, name: template.name, tasks: template.tasks },
        null,
        2,
      );
    },
    async importJsonText(jsonText) {
      const parsed = JSON.parse(jsonText) as {
        schemaVersion?: number;
        name?: string;
        tasks?: TaskCreateInput[];
      };
      const name = (parsed.name ?? "").trim();
      if (
        !name ||
        !parsed.tasks ||
        parsed.tasks.length !== 1 ||
        parsed.tasks[0].taskKind !== "main"
      ) {
        throw new Error("模板数据无效");
      }
      const timestamp = now();
      const template: TaskTemplate = {
        id: nextId("mock-template"),
        name,
        projectId: null,
        tasks: JSON.parse(JSON.stringify(parsed.tasks)) as TaskCreateInput[],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      mockTemplates.push(template);
      return JSON.parse(JSON.stringify(template)) as TaskTemplate;
    },
    async exportFile() {
      return { path: "演示模式：桌面端可导出模板文件", count: 1, format: "json" };
    },
    async importFile() {
      throw new Error("演示模式：桌面端可导入模板文件");
    },
  },
  share: {
    async exportTask() {
      return { path: "演示模式：桌面端可导出任务文件", count: 1, format: "task" };
    },
    async importFile() {
      throw new Error("演示模式：桌面端可导入任务文件");
    },
    async importJsonText() {
      return { projects: 0, tags: 0, tasks: 0 };
    },
  },
  reminders: {
    async playSound() {},
    async setScheduled() {
      return "演示模式：桌面端可注册后台提醒任务";
    },
    async sendTestWebhook() {
      return "演示模式：请配置通知渠道后使用桌面端测试";
    },
  },
  batch: {
    async complete(ids) {
      let count = 0;
      for (const id of ids) {
        const task = findTask(id);
        if (!task.deletedAt && task.status !== "completed") {
          Object.assign(task, transitionTaskStatus(task, "completed", now()));
          if (task.taskKind === "main" && task.repeatFrequency !== "none") {
            const nextDue = nextRepeatDue(
              task.dueAt,
              task.repeatFrequency,
              task.repeatInterval,
              task.repeatEndsAt,
              now(),
            );
            if (nextDue) {
              const input = taskTreeToCreateInput(task, tasks);
              createMockTaskTree({ ...input, dueAt: nextDue, status: "todo" }, null);
            }
          }
          count += 1;
        }
      }
      return count;
    },
    async softDelete(ids) {
      let count = 0;
      for (const id of ids) {
        const task = findTask(id);
        if (!task.deletedAt) {
          Object.assign(task, softDeleteTaskState(task, now()));
          applySubtreeState(id, softDeleteTaskState);
          count += 1;
        }
      }
      return count;
    },
    async restore(ids) {
      let count = 0;
      for (const id of ids) {
        const task = findTask(id);
        if (task.deletedAt) {
          Object.assign(task, restoreTaskState(task, now()));
          applySubtreeState(id, restoreTaskState);
          count += 1;
        }
      }
      return count;
    },
    async hardDelete(ids) {
      let count = 0;
      for (const id of ids) {
        count += removeTaskSubtree(id);
      }
      return count;
    },
    async setPriority(ids, priority: TaskPriority) {
      let count = 0;
      for (const id of ids) {
        const task = findTask(id);
        if (!task.deletedAt) {
          task.priority = priority;
          task.updatedAt = now();
          count += 1;
        }
      }
      return count;
    },
    async setProject(ids, projectId) {
      ensureProject(projectId);
      let count = 0;
      for (const id of ids) {
        const task = findTask(id);
        if (!task.deletedAt) {
          task.projectId = projectId;
          task.updatedAt = now();
          cascadeProjectToDescendants(id, projectId);
          count += 1;
        }
      }
      return count;
    },
    async addTags(ids, tagIds) {
      ensureTags(tagIds);
      let count = 0;
      for (const id of ids) {
        const task = findTask(id);
        if (!task.deletedAt) {
          for (const tagId of tagIds) {
            if (!task.tagIds.includes(tagId)) {
              task.tagIds.push(tagId);
            }
          }
          task.updatedAt = now();
          count += 1;
        }
      }
      return count;
    },
    async clearTrash() {
      let count = 0;
      for (let index = tasks.length - 1; index >= 0; index -= 1) {
        if (tasks[index].deletedAt) {
          tasks.splice(index, 1);
          count += 1;
        }
      }
      return count;
    },
  },
  data: {
    async backupNow() {
      const info: BackupInfo = {
        path: `memory://backups/task-manager-${Date.now()}.db`,
        createdAt: now(),
        sizeBytes: new TextEncoder().encode(JSON.stringify(buildPayload())).length,
      };
      backups.unshift(info);
      backups.splice(10);
      settings.lastBackupAt = info.createdAt;
      return { ...info };
    },
    async listBackups(): Promise<BackupSummary> {
      return {
        dataDirectory: "浏览器预览（内存）",
        backupDirectory: "浏览器预览（内存）",
        lastBackupAt: settings.lastBackupAt,
        backups: backups.map((backup) => ({ ...backup })),
      };
    },
    async exportJson(): Promise<ExportResult> {
      const payload = buildPayload();
      const json = JSON.stringify(payload, null, 2);
      triggerDownload(
        `TaskCrate-备份-${new Date().toISOString().slice(0, 10)}.json`,
        json,
        "application/json",
      );
      return { path: "浏览器下载", count: payload.tasks.length, format: "json" };
    },
    async exportExcel(): Promise<ExportResult> {
      throw new Error("浏览器预览暂不支持 Excel 导出，请使用桌面端");
    },
    async importCsvFile(): Promise<ImportResult> {
      throw new Error("浏览器预览暂不支持 CSV 导入，请使用桌面端");
    },
    async importExcelFile(): Promise<ImportResult> {
      throw new Error("浏览器预览暂不支持 Excel 导入，请使用桌面端");
    },
    async exportCsv(): Promise<ExportResult> {
      const active = tasks.filter((task) => !task.deletedAt);
      const projectNames = new Map(projects.map((project) => [project.id, project.name]));
      const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));
      const lines = [
        [
          "ID",
          "标题",
          "备注",
          "截止时间",
          "优先级",
          "状态",
          "项目",
          "标签",
          "创建时间",
          "完成时间",
        ].join(","),
        ...active.map((task) =>
          [
            task.id,
            csvValue(task.title),
            csvValue(task.notes ?? ""),
            csvValue(task.dueAt ?? ""),
            task.priority,
            task.status,
            csvValue(projectNames.get(task.projectId ?? "") ?? "收件箱"),
            csvValue(task.tagIds.map((id) => tagNames.get(id) ?? id).join(";")),
            csvValue(task.createdAt),
            csvValue(task.completedAt ?? ""),
          ].join(","),
        ),
      ];
      triggerDownload(
        `TaskCrate-导出-${new Date().toISOString().slice(0, 10)}.csv`,
        `\u{feff}${lines.join("\n")}`,
        "text/csv;charset=utf-8",
      );
      return { path: "浏览器下载", count: active.length, format: "csv" };
    },
    async importJsonFile() {
      throw new Error("浏览器预览请使用粘贴 JSON 导入");
    },
    async importJsonText(text, replace) {
      const parsed = JSON.parse(text) as BackupPayload;
      return importPayload(parsed, replace);
    },
    async restoreFile() {
      throw new Error("演示模式：桌面端可从备份文件恢复");
    },
    async checkUpdate(): Promise<UpdateStatus> {
      return {
        currentVersion: "0.1.0",
        latestVersion: null,
        hasUpdate: false,
        updateUrl: null,
        releaseUrl: null,
        releaseName: null,
        releaseNotes: null,
        publishedAt: null,
        checkedAt: now(),
        message: "Web 预览模式暂未配置更新源，当前为最新已知版本",
      };
    },
  },
};
