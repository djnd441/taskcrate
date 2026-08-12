import type {
  AiConversation,
  AiConversationSummary,
  AuditLog,
  BackupInfo,
  BackupSummary,
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
  UpdateStatus,
} from "@task-manager/domain";
import {
  nextRepeatDue,
  taskTreeToCreateInput,
} from "@task-manager/domain";
import {
  archiveTask as archiveTaskState,
  restoreTask as restoreTaskState,
  softDeleteTask as softDeleteTaskState,
  transitionTaskStatus,
  unarchiveTask as unarchiveTaskState,
} from "@task-manager/domain";
import type { AppAdapters } from "./types";

const DB_NAME = "task-manager-web";
const DB_VERSION = 7;

const defaultProjects: Project[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "收件箱",
    color: "#6B7280",
    sortOrder: 0,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "工作",
    color: "#4F6EF7",
    sortOrder: 1,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "个人",
    color: "#16A34A",
    sortOrder: 2,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "学习",
    color: "#D97706",
    sortOrder: 3,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const defaultTags: Tag[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "重要",
    color: "#E5484D",
    createdAt: new Date().toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "紧急",
    color: "#F76B15",
    createdAt: new Date().toISOString(),
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

interface StoredLibraryResource extends LibraryResource {
  file?: File;
}

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

interface BackupRecord {
  id: string;
  createdAt: string;
  sizeBytes: number;
  data: string;
}

interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  projects: Project[];
  tags: Tag[];
  tasks: Task[];
  settings?: Settings;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    parentId: task.parentId ?? null,
    taskKind: task.taskKind ?? "main",
    repeatFrequency: task.repeatFrequency ?? "none",
    repeatInterval: task.repeatInterval ?? 1,
    repeatEndsAt: task.repeatEndsAt ?? null,
    assignee: task.assignee ?? null,
    department: task.department ?? null,
    startAt: task.startAt ?? null,
    doneCriteria: task.doneCriteria ?? null,
    budget: task.budget ?? null,
    resources: Array.isArray(task.resources)
      ? task.resources.map((resource) => ({ ...resource }))
      : [],
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("tags")) {
        db.createObjectStore("tags", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("tasks")) {
        db.createObjectStore("tasks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("backups")) {
        db.createObjectStore("backups", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("aiConversations")) {
        db.createObjectStore("aiConversations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("attachments")) {
        db.createObjectStore("attachments", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("taskTemplates")) {
        db.createObjectStore("taskTemplates", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("auditLogs")) {
        db.createObjectStore("auditLogs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("taskComments")) {
        db.createObjectStore("taskComments", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("projectMembers")) {
        db.createObjectStore("projectMembers", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("libraryResources")) {
        db.createObjectStore("libraryResources", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 请求失败"));
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).getAll();
  return requestResult(request);
}

async function putRecord<T extends { id: string }>(storeName: string, value: T): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 写入失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 写入已中止"));
  });
}

async function deleteRecord(storeName: string, id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 删除失败"));
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 清空失败"));
  });
}

async function ensureSeed(): Promise<void> {
  const existing = await getAll<Project>("projects");
  if (existing.length > 0) {
    return;
  }
  for (const project of defaultProjects) {
    await putRecord("projects", clone(project));
  }
  for (const tag of defaultTags) {
    await putRecord("tags", clone(tag));
  }
  const settings = await getSettingsRecord();
  await putRecord("settings", { ...settings, id: "app" } as Settings & { id: string });
}

async function getSettingsRecord(): Promise<Settings> {
  const db = await openDatabase();
  const transaction = db.transaction("settings", "readonly");
  const request = transaction.objectStore("settings").get("app");
  const existing = await requestResult<Settings | undefined>(request);
  return existing ? clone(existing) : clone(defaultSettings);
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
    items: list.slice(offset, offset + limit).map(clone),
    total: list.length,
    offset,
    limit,
  };
}

async function findTask(id: string): Promise<Task> {
  const db = await openDatabase();
  const transaction = db.transaction("tasks", "readonly");
  const request = transaction.objectStore("tasks").get(id);
  const task = await requestResult<Task | undefined>(request);
  if (!task) {
    throw new Error(`任务不存在：${id}`);
  }
  return normalizeTask(clone(task));
}

async function ensureProjectExists(id: string | null): Promise<void> {
  if (!id) {
    return;
  }
  const projects = await getAll<Project>("projects");
  if (!projects.some((project) => project.id === id)) {
    throw new Error(`项目不存在：${id}`);
  }
}

async function ensureTagsExist(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const tags = await getAll<Tag>("tags");
  for (const id of ids) {
    if (!tags.some((tag) => tag.id === id)) {
      throw new Error(`标签不存在：${id}`);
    }
  }
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function buildPayload(): Promise<BackupPayload> {
  const [projects, tags, tasks, settings] = await Promise.all([
    getAll<Project>("projects"),
    getAll<Tag>("tags"),
    getAll<Task>("tasks"),
    getSettingsRecord(),
  ]);
  return {
    schemaVersion: 1,
    exportedAt: nowIso(),
    projects,
    tags,
    tasks: tasks.map(normalizeTask),
    settings,
  };
}

async function importPayload(payload: BackupPayload, replace: boolean): Promise<ImportResult> {
  if (!Array.isArray(payload.projects) || !Array.isArray(payload.tags) || !Array.isArray(payload.tasks)) {
    throw new Error("JSON 结构无效：缺少 projects、tags 或 tasks");
  }
  for (const task of payload.tasks) {
    if (!task.title?.trim()) {
      throw new Error(`导入失败：任务 ${task.id} 标题不能为空`);
    }
  }
  if (replace) {
    await Promise.all([
      clearStore("projects"),
      clearStore("tags"),
      clearStore("tasks"),
      clearStore("backups"),
    ]);
  }
  const existingProjects = await getAll<Project>("projects");
  const existingTags = await getAll<Tag>("tags");
  const existingTasks = await getAll<Task>("tasks");
  let projects = 0;
  let tags = 0;
  let tasks = 0;
  for (const project of payload.projects) {
    if (!project.name?.trim()) {
      throw new Error("导入失败：项目名称不能为空");
    }
    if (!existingProjects.some((item) => item.id === project.id)) {
      await putRecord("projects", { ...project, name: project.name.trim() });
      existingProjects.push(project);
      projects += 1;
    }
  }
  for (const tag of payload.tags) {
    if (!tag.name?.trim()) {
      throw new Error("导入失败：标签名称不能为空");
    }
    if (!existingTags.some((item) => item.id === tag.id)) {
      await putRecord("tags", { ...tag, name: tag.name.trim() });
      existingTags.push(tag);
      tags += 1;
    }
  }
  for (const task of payload.tasks) {
    if (existingTasks.some((item) => item.id === task.id)) {
      continue;
    }
    const projectId =
      task.projectId && existingProjects.some((project) => project.id === task.projectId)
        ? task.projectId
        : null;
    const tagIds = (task.tagIds ?? []).filter((id) =>
      existingTags.some((tag) => tag.id === id),
    );
    await putRecord("tasks", {
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
    existingTasks.push(task);
    tasks += 1;
  }
  if (payload.settings) {
    await putRecord("settings", { ...payload.settings, id: "app" } as Settings & { id: string });
  }
  return { projects, tags, tasks };
}

function csvValue(value: string): string {
  return value.includes(",") || value.includes('"') || value.includes("\n")
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

async function createIndexedTaskTree(
  input: TaskCreateInput,
  parentId: string | null,
): Promise<Task> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("任务标题不能为空");
  }
  await ensureProjectExists(input.projectId ?? null);
  await ensureTagsExist(input.tagIds ?? []);
  const all = await getAll<Task>("tasks");
  const timestamp = nowIso();
  const task: Task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      id: `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`,
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
    sortOrder: input.sortOrder ?? all.length,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: input.status === "completed" ? timestamp : null,
    deletedAt: null,
    schemaVersion: 1,
  };
  await putRecord("tasks", task);
  for (const child of input.children ?? []) {
    await createIndexedTaskTree(child, task.id);
  }
  return clone(task);
}

export const indexedDbAdapter: AppAdapters = {
  tasks: {
    async get(id) {
      const task = await findTask(id);
      return task;
    },
    async list(filter = {}, sort = { field: "createdAt", direction: "asc" }, offset = 0, limit = 100) {
      await ensureSeed();
      const all = (await getAll<Task>("tasks")).map(normalizeTask);
      const filtered = all.filter((task) => matchesFilter(task, filter));
      return taskPage(sortTasks(filtered, sort), Math.max(offset, 0), Math.min(limit, 10000));
    },
    async create(input) {
      await ensureSeed();
      return createIndexedTaskTree(input, input.parentId ?? null);
    },
    async update(id, input) {
      const task = await findTask(id);
      if (task.deletedAt) {
        throw new Error("任务在回收站中，无法编辑");
      }
      if (input.title !== undefined) {
        const title = input.title.trim();
        if (!title) {
          throw new Error("任务标题不能为空");
        }
        task.title = title;
      }
      if (input.notes !== undefined) {
        task.notes = input.notes;
      }
      if (input.dueAt !== undefined) {
        task.dueAt = input.dueAt;
      }
      if (input.repeatFrequency !== undefined) {
        task.repeatFrequency = input.repeatFrequency;
      }
      if (input.repeatInterval !== undefined) {
        task.repeatInterval = input.repeatInterval;
      }
      if (input.repeatEndsAt !== undefined) {
        task.repeatEndsAt = input.repeatEndsAt;
      }
      if (input.assignee !== undefined) {
        task.assignee = input.assignee;
      }
      if (input.department !== undefined) {
        task.department = input.department;
      }
      if (input.startAt !== undefined) {
        task.startAt = input.startAt;
      }
      if (input.doneCriteria !== undefined) {
        task.doneCriteria = input.doneCriteria;
      }
      if (input.budget !== undefined) {
        task.budget = input.budget;
      }
      if (input.priority !== undefined) {
        task.priority = input.priority;
      }
      if (input.projectId !== undefined) {
        await ensureProjectExists(input.projectId);
        task.projectId = input.projectId;
      }
      if (input.tagIds !== undefined) {
        await ensureTagsExist(input.tagIds);
        task.tagIds = [...input.tagIds];
      }
      if (input.parentId !== undefined) {
        if (input.parentId) {
          const allTasks = await getAll<Task>("tasks");
          if (!allTasks.some((item) => item.id === input.parentId)) {
            throw new Error(`父任务不存在：${input.parentId}`);
          }
        }
        task.parentId = input.parentId;
      }
      if (input.taskKind !== undefined) {
        task.taskKind = input.taskKind;
      }
      if (input.resources !== undefined) {
        const timestamp = nowIso();
        task.resources = input.resources.map((resource, index) => ({
          id: `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`,
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
        task.sortOrder = input.sortOrder;
      }
      task.updatedAt = nowIso();
      await putRecord("tasks", task);
      return clone(task);
    },
    async transitionStatus(id, status) {
      const task = await findTask(id);
      if (task.deletedAt) {
        throw new Error("任务在回收站中，无法变更状态");
      }
      const updated = transitionTaskStatus(task, status, nowIso());
      await putRecord("tasks", updated);
      if (
        updated.status === "completed" &&
        updated.taskKind === "main" &&
        updated.repeatFrequency !== "none"
      ) {
        const all = (await getAll<Task>("tasks")).map(normalizeTask);
        const nextDue = nextRepeatDue(
          updated.dueAt,
          updated.repeatFrequency,
          updated.repeatInterval,
          updated.repeatEndsAt,
          nowIso(),
        );
        if (nextDue) {
          const input = taskTreeToCreateInput(updated, all);
          await createIndexedTaskTree(
            {
              ...input,
              dueAt: nextDue,
              status: "todo",
            },
            null,
          );
        }
      }
      return clone(updated);
    },
    async archive(id) {
      const task = await findTask(id);
      const updated = archiveTaskState(task, nowIso());
      await putRecord("tasks", updated);
      return clone(updated);
    },
    async unarchive(id) {
      const task = await findTask(id);
      const updated = unarchiveTaskState(task, nowIso());
      await putRecord("tasks", updated);
      return clone(updated);
    },
    async softDelete(id) {
      const task = await findTask(id);
      const updated = softDeleteTaskState(task, nowIso());
      await putRecord("tasks", updated);
      return clone(updated);
    },
    async restore(id) {
      const task = await findTask(id);
      const updated = restoreTaskState(task, nowIso());
      await putRecord("tasks", updated);
      return clone(updated);
    },
    async hardDelete(id) {
      await deleteRecord("tasks", id);
    },
  },
  projects: {
    async list(includeArchived = false) {
      await ensureSeed();
      const projects = await getAll<Project>("projects");
      return projects
        .filter((project) => includeArchived || !project.isArchived)
        .map(clone)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async get(id) {
      const db = await openDatabase();
      const transaction = db.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").get(id);
      const project = await requestResult<Project | undefined>(request);
      return project ? clone(project) : null;
    },
    async create(input) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("项目名称不能为空");
      }
      const projects = await getAll<Project>("projects");
      const timestamp = nowIso();
      const project: Project = {
        id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? projects.length,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await putRecord("projects", project);
      return clone(project);
    },
    async update(id, input) {
      const db = await openDatabase();
      const transaction = db.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").get(id);
      const project = await requestResult<Project | undefined>(request);
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
      project.updatedAt = nowIso();
      await putRecord("projects", project);
      return clone(project);
    },
    async archive(id) {
      return this.update(id, { isArchived: true });
    },
    async delete(id) {
      await deleteRecord("projects", id);
    },
  },
  tags: {
    async list() {
      await ensureSeed();
      const tags = await getAll<Tag>("tags");
      return tags.map(clone).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async get(id) {
      const db = await openDatabase();
      const transaction = db.transaction("tags", "readonly");
      const request = transaction.objectStore("tags").get(id);
      const tag = await requestResult<Tag | undefined>(request);
      return tag ? clone(tag) : null;
    },
    async create(input) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("标签名称不能为空");
      }
      const tags = await getAll<Tag>("tags");
      if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("标签名称已存在");
      }
      const tag: Tag = {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        color: input.color ?? null,
        createdAt: nowIso(),
      };
      await putRecord("tags", tag);
      return clone(tag);
    },
    async update(id, input) {
      const db = await openDatabase();
      const transaction = db.transaction("tags", "readonly");
      const request = transaction.objectStore("tags").get(id);
      const tag = await requestResult<Tag | undefined>(request);
      if (!tag) {
        throw new Error(`标签不存在：${id}`);
      }
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) {
          throw new Error("标签名称不能为空");
        }
        const tags = await getAll<Tag>("tags");
        if (tags.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
          throw new Error("标签名称已存在");
        }
        tag.name = name;
      }
      if (input.color !== undefined) {
        tag.color = input.color;
      }
      await putRecord("tags", tag);
      return clone(tag);
    },
    async delete(id) {
      await deleteRecord("tags", id);
      const tasks = await getAll<Task>("tasks");
      for (const task of tasks) {
        if (task.tagIds.includes(id)) {
          task.tagIds = task.tagIds.filter((tagId) => tagId !== id);
          await putRecord("tasks", task);
        }
      }
    },
  },
  settings: {
    async get() {
      await ensureSeed();
      return getSettingsRecord();
    },
    async update(patch) {
      const settings = await getSettingsRecord();
      const updated = { ...settings, ...patch, id: "app" } as Settings & { id: string };
      await putRecord("settings", updated);
      const result = { ...updated } as Settings;
      delete (result as unknown as Record<string, unknown>).id;
      return result;
    },
  },
  ai: {
    async chat(messages) {
      const lastUser = [...messages].reverse().find((message) => message.role === "user");
      const content = lastUser?.content?.trim() ?? "";
      if (/创建任务|创建主任务/.test(content)) {
        const title =
          content.replace(/.*?(创建任务|创建主任务)\s*[:：]?\s*/, "").trim() ||
          "AI 演示任务";
        await indexedDbAdapter.tasks.create({ title });
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
        const task = await indexedDbAdapter.tasks.create(args as unknown as TaskCreateInput);
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
      const conversations = await getAll<AiConversation>("aiConversations");
      return conversations
        .map(
          (conversation): AiConversationSummary => ({
            id: conversation.id,
            title: conversation.title,
            provider: conversation.provider,
            model: conversation.model,
            messageCount: conversation.messages.length,
            updatedAt: conversation.updatedAt,
          }),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getConversation(id) {
      const db = await openDatabase();
      const transaction = db.transaction("aiConversations", "readonly");
      const request = transaction.objectStore("aiConversations").get(id);
      const conversation = await requestResult<AiConversation | undefined>(request);
      return conversation ? clone(conversation) : null;
    },
    async createConversation(provider, model) {
      const timestamp = nowIso();
      const conversation: AiConversation = {
        id: `ai-conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: "新对话",
        provider,
        model,
        messages: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await putRecord("aiConversations", conversation);
      return clone(conversation);
    },
    async saveConversation(conversation) {
      const saved = clone<AiConversation>({
        ...conversation,
        title: conversation.title.trim() || "新对话",
        updatedAt: nowIso(),
      });
      await putRecord("aiConversations", saved);
      return clone(saved);
    },
    async deleteConversation(id) {
      await deleteRecord("aiConversations", id);
    },
  },
  attachments: {
    async pickFiles() {
      return [];
    },
    async list(taskId) {
      const all = await getAll<TaskAttachment>("attachments");
      return all
        .filter((item) => item.taskId === taskId)
        .map(clone)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async counts(taskIds) {
      const all = await getAll<TaskAttachment>("attachments");
      const counts: Record<string, number> = {};
      for (const taskId of taskIds) {
        counts[taskId] = all.filter((item) => item.taskId === taskId).length;
      }
      return counts;
    },
    async add(taskId, draft) {
      const timestamp = nowIso();
      const attachment: TaskAttachment = {
        id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId,
        name: draft.name,
        mimeType: draft.file?.type ?? "",
        sizeBytes: draft.sizeBytes,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await putRecord("attachments", attachment);
      return clone(attachment);
    },
    async remove(id) {
      await deleteRecord("attachments", id);
    },
    async package(taskId) {
      const all = await getAll<TaskAttachment>("attachments");
      const count = all.filter((item) => item.taskId === taskId).length;
      return count > 0
        ? "演示模式：打包功能需要桌面端"
        : "演示模式：暂无附件可打包";
    },
  },
  library: {
    async list() {
      const all = await getAll<StoredLibraryResource>("libraryResources");
      return all.map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        kind: item.kind,
        sizeBytes: item.sizeBytes,
        storagePath: "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    },
    async pickFile() {
      return [];
    },
    async addDraft(draft) {
      const timestamp = nowIso();
      const resource: StoredLibraryResource = {
        id: `library-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: draft.name,
        mimeType: draft.file?.type ?? "",
        kind: libraryKindOf(draft.name, draft.file?.type ?? ""),
        sizeBytes: draft.sizeBytes,
        storagePath: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        file: draft.file,
      };
      await putRecord("libraryResources", resource);
      return {
        id: resource.id,
        name: resource.name,
        mimeType: resource.mimeType,
        kind: resource.kind,
        sizeBytes: resource.sizeBytes,
        storagePath: "",
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
      };
    },
    async remove(id) {
      await deleteRecord("libraryResources", id);
    },
    async copyToTask(libraryId, taskId) {
      const all = await getAll<StoredLibraryResource>("libraryResources");
      const item = all.find((resource) => resource.id === libraryId);
      if (!item) {
        throw new Error("素材不存在");
      }
      const timestamp = nowIso();
      const attachment: TaskAttachment = {
        id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId,
        name: item.name,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await putRecord("attachments", attachment);
      return clone(attachment);
    },
  },
  comments: {
    async list(taskId) {
      const all = await getAll<TaskComment>("taskComments");
      return all
        .filter((item) => item.taskId === taskId)
        .map(clone)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async add(input) {
      const timestamp = nowIso();
      const comment: TaskComment = {
        id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId: input.taskId,
        author: input.author.trim(),
        content: input.content.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await putRecord("taskComments", comment);
      return clone(comment);
    },
    async remove(id) {
      await deleteRecord("taskComments", id);
    },
  },
  projectMembers: {
    async list(projectId) {
      const all = await getAll<ProjectMember>("projectMembers");
      return all
        .filter((item) => item.projectId === projectId)
        .map(clone)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async add(input) {
      const member: ProjectMember = {
        id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        projectId: input.projectId,
        name: input.name.trim(),
        email: input.email.trim(),
        role: input.role,
        createdAt: nowIso(),
      };
      await putRecord("projectMembers", member);
      return clone(member);
    },
    async remove(id) {
      await deleteRecord("projectMembers", id);
    },
  },  audit: {
    async list(limit = 200) {
      const all = await getAll<AuditLog>("auditLogs");
      return all
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.min(limit, 2000))
        .map(clone);
    },
  },  templates: {
    async list() {
      await ensureSeed();
      const all = await getAll<TaskTemplate>("taskTemplates");
      return all.map(clone).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(id) {
      const db = await openDatabase();
      const transaction = db.transaction("taskTemplates", "readonly");
      const request = transaction.objectStore("taskTemplates").get(id);
      const template = await requestResult<TaskTemplate | undefined>(request);
      return template ? clone(template) : null;
    },
    async create(input) {
      await ensureSeed();
      const name = input.name.trim();
      if (!name) {
        throw new Error("模板名称不能为空");
      }
      if (input.tasks.length !== 1 || input.tasks[0].taskKind !== "main") {
        throw new Error("模板根节点必须是一个主任务");
      }
      if (input.projectId) {
        await ensureProjectExists(input.projectId);
      }
      const timestamp = nowIso();
      const template: TaskTemplate = {
        id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        projectId: input.projectId ?? null,
        tasks: clone(input.tasks),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await putRecord("taskTemplates", template);
      return clone(template);
    },
    async delete(id) {
      await deleteRecord("taskTemplates", id);
    },
    async exportJsonText(templateId) {
      await ensureSeed();
      const all = await getAll<TaskTemplate>("taskTemplates");
      const template = all.find((item) => item.id === templateId);
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
      await ensureSeed();
      const parsed = JSON.parse(jsonText) as { schemaVersion?: number; name?: string; tasks?: TaskCreateInput[] };
      const name = (parsed.name ?? "").trim();
      if (!name || !parsed.tasks || parsed.tasks.length !== 1 || parsed.tasks[0].taskKind !== "main") {
        throw new Error("模板数据无效");
      }
      const timestamp = nowIso();
      const template: TaskTemplate = {
        id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        projectId: null,
        tasks: clone(parsed.tasks),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await putRecord("taskTemplates", template);
      return clone(template);
    },
    async exportFile() {
      return { path: "演示模式：桌面端可导出模板文件", count: 1, format: "json" };
    },
    async importFile() {
      throw new Error("演示模式：桌面端可导入模板文件");
    },
  },  share: {
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
      const tasks = await getAll<Task>("tasks");
      let count = 0;
      for (const id of ids) {
        const task = tasks.find((item) => item.id === id);
        if (task && !task.deletedAt && task.status !== "completed") {
          Object.assign(task, transitionTaskStatus(task, "completed", nowIso()));
          await putRecord("tasks", task);
          if (task.taskKind === "main" && task.repeatFrequency !== "none") {
            const all = (await getAll<Task>("tasks")).map(normalizeTask);
            const nextDue = nextRepeatDue(
              task.dueAt,
              task.repeatFrequency,
              task.repeatInterval,
              task.repeatEndsAt,
              nowIso(),
            );
            if (nextDue) {
              const input = taskTreeToCreateInput(task, all);
              await createIndexedTaskTree(
                {
                  ...input,
                  dueAt: nextDue,
                  status: "todo",
                },
                null,
              );
            }
          }
          count += 1;
        }
      }
      return count;
    },
    async softDelete(ids) {
      const tasks = await getAll<Task>("tasks");
      let count = 0;
      for (const id of ids) {
        const task = tasks.find((item) => item.id === id);
        if (task && !task.deletedAt) {
          Object.assign(task, softDeleteTaskState(task, nowIso()));
          await putRecord("tasks", task);
          count += 1;
        }
      }
      return count;
    },
    async restore(ids) {
      const tasks = await getAll<Task>("tasks");
      let count = 0;
      for (const id of ids) {
        const task = tasks.find((item) => item.id === id);
        if (task?.deletedAt) {
          Object.assign(task, restoreTaskState(task, nowIso()));
          await putRecord("tasks", task);
          count += 1;
        }
      }
      return count;
    },
    async hardDelete(ids) {
      let count = 0;
      for (const id of ids) {
        await deleteRecord("tasks", id);
        count += 1;
      }
      return count;
    },
    async setPriority(ids, priority) {
      const tasks = await getAll<Task>("tasks");
      let count = 0;
      for (const id of ids) {
        const task = tasks.find((item) => item.id === id);
        if (task && !task.deletedAt) {
          task.priority = priority;
          task.updatedAt = nowIso();
          await putRecord("tasks", task);
          count += 1;
        }
      }
      return count;
    },
    async setProject(ids, projectId) {
      await ensureProjectExists(projectId);
      const tasks = await getAll<Task>("tasks");
      let count = 0;
      for (const id of ids) {
        const task = tasks.find((item) => item.id === id);
        if (task && !task.deletedAt) {
          task.projectId = projectId;
          task.updatedAt = nowIso();
          await putRecord("tasks", task);
          count += 1;
        }
      }
      return count;
    },
    async addTags(ids, tagIds) {
      await ensureTagsExist(tagIds);
      const tasks = await getAll<Task>("tasks");
      let count = 0;
      for (const id of ids) {
        const task = tasks.find((item) => item.id === id);
        if (task && !task.deletedAt) {
          for (const tagId of tagIds) {
            if (!task.tagIds.includes(tagId)) {
              task.tagIds.push(tagId);
            }
          }
          task.updatedAt = nowIso();
          await putRecord("tasks", task);
          count += 1;
        }
      }
      return count;
    },
    async clearTrash() {
      const tasks = await getAll<Task>("tasks");
      const deleted = tasks.filter((task) => task.deletedAt);
      for (const task of deleted) {
        await deleteRecord("tasks", task.id);
      }
      return deleted.length;
    },
  },
  data: {
    async backupNow() {
      const payload = await buildPayload();
      const data = JSON.stringify(payload);
      const record: BackupRecord = {
        id: `backup-${Date.now()}`,
        createdAt: nowIso(),
        sizeBytes: new TextEncoder().encode(data).length,
        data,
      };
      await putRecord("backups", record);
      const backups = await getAll<BackupRecord>("backups");
      for (const old of backups.slice(10)) {
        await deleteRecord("backups", old.id);
      }
      const info: BackupInfo = {
        path: `indexeddb://backups/${record.id}`,
        createdAt: record.createdAt,
        sizeBytes: record.sizeBytes,
      };
      const settings = await getSettingsRecord();
      await putRecord("settings", { ...settings, lastBackupAt: record.createdAt, id: "app" });
      return info;
    },
    async listBackups(): Promise<BackupSummary> {
      const backups = await getAll<BackupRecord>("backups");
      const settings = await getSettingsRecord();
      return {
        dataDirectory: "IndexedDB（浏览器持久化）",
        backupDirectory: "IndexedDB：backups",
        lastBackupAt: settings.lastBackupAt,
        backups: backups
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 10)
          .map((backup) => ({
            path: `indexeddb://backups/${backup.id}`,
            createdAt: backup.createdAt,
            sizeBytes: backup.sizeBytes,
          })),
      };
    },
    async exportJson(): Promise<ExportResult> {
      const payload = await buildPayload();
      const json = JSON.stringify(payload, null, 2);
      download(
        `TaskCrate-备份-${new Date().toISOString().slice(0, 10)}.json`,
        json,
        "application/json",
      );
      return { path: "浏览器下载", count: payload.tasks.length, format: "json" };
    },
    async exportExcel(): Promise<ExportResult> {
      throw new Error("Web 预览暂不支持 Excel 导出，请使用桌面端");
    },
    async importCsvFile(): Promise<ImportResult> {
      throw new Error("Web 预览暂不支持 CSV 导入，请使用桌面端");
    },
    async importExcelFile(): Promise<ImportResult> {
      throw new Error("Web 预览暂不支持 Excel 导入，请使用桌面端");
    },
    async exportCsv(): Promise<ExportResult> {
      const [tasks, projects, tags] = await Promise.all([
        getAll<Task>("tasks"),
        getAll<Project>("projects"),
        getAll<Tag>("tags"),
      ]);
      const active = tasks.filter((task) => !task.deletedAt);
      const projectNames = new Map(projects.map((project) => [project.id, project.name]));
      const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));
      const lines = [
        ["ID", "标题", "备注", "截止时间", "优先级", "状态", "项目", "标签", "创建时间", "完成时间"].join(","),
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
      download(
        `TaskCrate-导出-${new Date().toISOString().slice(0, 10)}.csv`,
        `\u{feff}${lines.join("\n")}`,
        "text/csv;charset=utf-8",
      );
      return { path: "浏览器下载", count: active.length, format: "csv" };
    },
    async importJsonFile() {
      throw new Error("Web 预览请使用粘贴 JSON 导入");
    },
    async importJsonText(text, replace) {
      await ensureSeed();
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
        checkedAt: nowIso(),
        message: "Web 预览模式暂未配置更新源，当前为最新已知版本",
      };
    },
  },
};
