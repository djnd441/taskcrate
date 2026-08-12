import type {
  AiService,
  AuditLog,
  BackupInfo,
  BackupSummary,
  ExportResult,
  ImportResult,
  ProjectMember,
  ProjectMemberInput,
  ProjectRepository,
  SettingsRepository,
  TagRepository,
  TaskComment,
  TaskCommentInput,
  TaskPriority,
  TaskRepository,
  TaskTemplateRepository,
  TaskTemplate,
  TaskAttachment,
  LibraryResource,
  UpdateStatus,
} from "@task-manager/domain";

export interface BatchTaskService {
  complete: (ids: string[]) => Promise<number>;
  softDelete: (ids: string[]) => Promise<number>;
  restore: (ids: string[]) => Promise<number>;
  hardDelete: (ids: string[]) => Promise<number>;
  setPriority: (ids: string[], priority: TaskPriority) => Promise<number>;
  setProject: (ids: string[], projectId: string | null) => Promise<number>;
  addTags: (ids: string[], tagIds: string[]) => Promise<number>;
  clearTrash: () => Promise<number>;
}

export interface DataTransferService {
  backupNow: () => Promise<BackupInfo>;
  listBackups: () => Promise<BackupSummary>;
  exportJson: () => Promise<ExportResult>;
  exportCsv: () => Promise<ExportResult>;
  exportExcel: () => Promise<ExportResult>;
  importCsvFile: () => Promise<ImportResult>;
  importExcelFile: () => Promise<ImportResult>;
  importJsonFile: (replace: boolean) => Promise<ImportResult>;
  importJsonText: (text: string, replace: boolean) => Promise<ImportResult>;
  restoreFile: () => Promise<ImportResult>;
  checkUpdate: () => Promise<UpdateStatus>;
}

export interface AttachmentDraft {
  key: string;
  name: string;
  sizeBytes: number;
  file?: File;
  path?: string;
}

export interface AttachmentService {
  pickFiles: () => Promise<AttachmentDraft[]>;
  list: (taskId: string) => Promise<TaskAttachment[]>;
  counts: (taskIds: string[]) => Promise<Record<string, number>>;
  add: (taskId: string, draft: AttachmentDraft) => Promise<TaskAttachment>;
  remove: (id: string) => Promise<void>;
  package: (taskId: string) => Promise<string>;
}

export interface LibraryService {
  list: () => Promise<LibraryResource[]>;
  pickFile: () => Promise<AttachmentDraft[]>;
  addDraft: (draft: AttachmentDraft) => Promise<LibraryResource>;
  remove: (id: string) => Promise<void>;
  copyToTask: (libraryId: string, taskId: string) => Promise<TaskAttachment>;
}

export interface ReminderService {
  playSound: () => Promise<void>;
  setScheduled: (enabled: boolean) => Promise<string>;
  sendTestWebhook: () => Promise<string>;
}

export interface ShareService {
  exportTask: (taskId: string) => Promise<ExportResult>;
  importFile: () => Promise<ImportResult>;
  importJsonText: (text: string, projectId?: string | null) => Promise<ImportResult>;
}
export interface AuditService {
  list: (limit?: number) => Promise<AuditLog[]>;
}
export interface CommentService {
  list: (taskId: string) => Promise<TaskComment[]>;
  add: (input: TaskCommentInput) => Promise<TaskComment>;
  remove: (id: string) => Promise<void>;
}

export interface ProjectMemberService {
  list: (projectId: string) => Promise<ProjectMember[]>;
  add: (input: ProjectMemberInput) => Promise<ProjectMember>;
  remove: (id: string) => Promise<void>;
}
export type TemplateService = TaskTemplateRepository & {
  exportJsonText: (templateId: string) => Promise<string>;
  importJsonText: (jsonText: string) => Promise<TaskTemplate>;
  exportFile: (templateId: string) => Promise<ExportResult>;
  importFile: () => Promise<TaskTemplate | null>;
};

export interface AppAdapters {
  tasks: TaskRepository;
  projects: ProjectRepository;
  tags: TagRepository;
  settings: SettingsRepository;
  ai: AiService;
  attachments: AttachmentService;
  library: LibraryService;
  reminders: ReminderService;
  share: ShareService;
  comments: CommentService;
  projectMembers: ProjectMemberService;
  audit: AuditService;
  templates: TemplateService;
  batch: BatchTaskService;
  data: DataTransferService;
}
