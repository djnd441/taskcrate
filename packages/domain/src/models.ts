export const SCHEMA_VERSION = 1;

export const TASK_STATUSES = ["todo", "in_progress", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const REPEAT_FREQUENCIES = ["none", "daily", "weekly", "monthly", "custom"] as const;
export type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];

export const TASK_KINDS = ["main", "major", "minor"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const RESOURCE_KINDS = ["tool", "material", "people", "budget", "other"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_STATUSES = ["pending", "ready", "in_use", "done"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const AI_PROVIDERS = ["off", "local", "cloud"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type AppLanguage = "zh-CN";

export interface TaskResource {
  id: string;
  name: string;
  kind: ResourceKind;
  quantity: string;
  unit: string;
  status: ResourceStatus;
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskResourceInput {
  name: string;
  kind: ResourceKind;
  quantity: string;
  unit: string;
  status: ResourceStatus;
  notes: string;
  sortOrder: number;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  repeatFrequency: RepeatFrequency;
  repeatInterval: number;
  repeatEndsAt: string | null;
  assignee: string | null;
  department: string | null;
  startAt: string | null;
  doneCriteria: string | null;
  budget: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  projectId: string | null;
  tagIds: string[];
  parentId: string | null;
  taskKind: TaskKind;
  resources: TaskResource[];
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  schemaVersion: number;
}

export interface TaskCreateInput {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  repeatFrequency?: RepeatFrequency;
  repeatInterval?: number;
  repeatEndsAt?: string | null;
  assignee?: string | null;
  department?: string | null;
  startAt?: string | null;
  doneCriteria?: string | null;
  budget?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  projectId?: string | null;
  tagIds?: string[];
  parentId?: string | null;
  taskKind?: TaskKind;
  resources?: TaskResourceInput[];
  children?: TaskCreateInput[];
  sortOrder?: number;
}

export interface TaskUpdateInput {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  repeatFrequency?: RepeatFrequency;
  repeatInterval?: number;
  repeatEndsAt?: string | null;
  assignee?: string | null;
  department?: string | null;
  startAt?: string | null;
  doneCriteria?: string | null;
  budget?: string | null;
  priority?: TaskPriority;
  projectId?: string | null;
  tagIds?: string[];
  parentId?: string | null;
  taskKind?: TaskKind;
  resources?: TaskResourceInput[];
  sortOrder?: number;
}

export interface Project {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreateInput {
  name: string;
  color?: string | null;
  sortOrder?: number;
}

export interface ProjectUpdateInput {
  name?: string;
  color?: string | null;
  sortOrder?: number;
  isArchived?: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface TagCreateInput {
  name: string;
  color?: string | null;
}

export interface TagUpdateInput {
  name?: string;
  color?: string | null;
}

export interface Settings {
  theme: ThemeMode;
  language: AppLanguage;
  remindersEnabled: boolean;
  remindMinutes: number;
  reminderSoundEnabled: boolean;
  remindWhenClosed: boolean;
  backupIntervalHours: number | null;
  dataDirectory: string | null;
  lastBackupAt: string | null;
  aiProvider: AiProvider;
  aiBaseUrl: string;
  aiModel: string;
  aiTemperature: number;
  aiToolsEnabled: boolean;
  aiConfirmDestructive: boolean;
  aiApiKeyConfigured: boolean;
  webhookDingTalk: string;
  webhookWeCom: string;
  webhookFeishu: string;
  webhookDingTalkConfigured: boolean;
  webhookWeComConfigured: boolean;
  webhookFeishuConfigured: boolean;
  schemaVersion: number;
}

export type SettingsPatch = Partial<Omit<Settings, "schemaVersion">>;

export interface AiToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface AiChatMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolCallId?: string;
  toolCalls?: AiToolCall[];
}

export interface AiChatResult {
  text: string | null;
  toolCalls: AiToolCall[];
}

export interface AiStreamChunk {
  type: "delta" | "done" | "error";
  content?: string;
  result?: AiChatResult;
  message?: string;
}

export interface AiConnectionResult {
  ok: boolean;
  latencyMs: number | null;
  model: string | null;
  message: string;
}

export interface AiConversation {
  id: string;
  title: string;
  provider: AiProvider;
  model: string;
  messages: AiChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  provider: AiProvider;
  model: string;
  messageCount: number;
  updatedAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}
export type LibraryResourceKind = "document" | "image" | "video" | "audio" | "other";

export interface LibraryResource {
  id: string;
  name: string;
  mimeType: string;
  kind: LibraryResourceKind;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface PackageResult {
  path: string;
  count: number;
}

export interface TaskTemplate {
  id: string;
  name: string;
  projectId: string | null;
  tasks: TaskCreateInput[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplateInput {
  name: string;
  projectId?: string | null;
  tasks: TaskCreateInput[];
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}
export interface TaskComment {
  id: string;
  taskId: string;
  author: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCommentInput {
  taskId: string;
  author: string;
  content: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  name: string;
  email: string;
  role: "viewer" | "editor" | "admin";
  createdAt: string;
}

export interface ProjectMemberInput {
  projectId: string;
  name: string;
  email: string;
  role: "viewer" | "editor" | "admin";
}
export interface BackupInfo {
  path: string;
  createdAt: string;
  sizeBytes: number;
}

export interface BackupSummary {
  dataDirectory: string;
  backupDirectory: string;
  lastBackupAt: string | null;
  backups: BackupInfo[];
}

export interface ImportResult {
  projects: number;
  tags: number;
  tasks: number;
}

export interface ExportResult {
  path: string;
  count: number;
  format: "json" | "csv" | "task";
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  updateUrl: string | null;
  releaseUrl: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  checkedAt: string;
  message: string;
}
