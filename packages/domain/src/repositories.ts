import type {
  AiChatMessage,
  AiChatResult,
  AiStreamChunk,
  AiConnectionResult,
  AiConversation,
  AiConversationSummary,
  AiProvider,
  Project,
  ProjectCreateInput,
  ProjectMember,
  ProjectMemberInput,
  ProjectUpdateInput,
  Settings,
  SettingsPatch,
  Tag,
  TaskTemplate,
  TaskTemplateInput,
  TagCreateInput,
  TagUpdateInput,
  Task,
  TaskComment,
  TaskCommentInput,
  TaskCreateInput,
  TaskStatus,
  TaskUpdateInput,
} from "./models";

export interface TaskFilter {
  query?: string;
  statuses?: TaskStatus[];
  priorities?: Task["priority"][];
  projectId?: string | null;
  tagIds?: string[];
  dueFrom?: string;
  dueUntil?: string;
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

export interface TaskSort {
  field: "createdAt" | "updatedAt" | "dueAt" | "priority" | "sortOrder";
  direction: "asc" | "desc";
}

export interface TaskPage {
  items: Task[];
  total: number;
  offset: number;
  limit: number;
}

export interface TaskRepository {
  get(id: string): Promise<Task | null>;
  list(filter?: TaskFilter, sort?: TaskSort, offset?: number, limit?: number): Promise<TaskPage>;
  create(input: TaskCreateInput): Promise<Task>;
  update(id: string, input: TaskUpdateInput): Promise<Task>;
  transitionStatus(id: string, status: TaskStatus): Promise<Task>;
  archive(id: string): Promise<Task>;
  unarchive(id: string): Promise<Task>;
  softDelete(id: string): Promise<Task>;
  restore(id: string): Promise<Task>;
  hardDelete(id: string): Promise<void>;
}

export interface ProjectRepository {
  list(includeArchived?: boolean): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  create(input: ProjectCreateInput): Promise<Project>;
  update(id: string, input: ProjectUpdateInput): Promise<Project>;
  archive(id: string): Promise<Project>;
  delete(id: string): Promise<void>;
}

export interface TagRepository {
  list(): Promise<Tag[]>;
  get(id: string): Promise<Tag | null>;
  create(input: TagCreateInput): Promise<Tag>;
  update(id: string, input: TagUpdateInput): Promise<Tag>;
  delete(id: string): Promise<void>;
}

export interface TaskTemplateRepository {
  list(): Promise<TaskTemplate[]>;
  get(id: string): Promise<TaskTemplate | null>;
  create(input: TaskTemplateInput): Promise<TaskTemplate>;
  delete(id: string): Promise<void>;
}

export interface TaskCommentRepository {
  list(taskId: string): Promise<TaskComment[]>;
  add(input: TaskCommentInput): Promise<TaskComment>;
  delete(id: string): Promise<void>;
}

export interface ProjectMemberRepository {
  list(projectId: string): Promise<ProjectMember[]>;
  add(input: ProjectMemberInput): Promise<ProjectMember>;
  delete(id: string): Promise<void>;
}
export interface SettingsRepository {
  get(): Promise<Settings>;
  update(patch: SettingsPatch): Promise<Settings>;
}

export interface AiService {
  chat(
    messages: AiChatMessage[],
    onStream?: (chunk: AiStreamChunk) => void,
  ): Promise<AiChatResult>;
  executeTool(name: string, args: Record<string, unknown>, confirmed: boolean): Promise<string>;
  testConnection(): Promise<AiConnectionResult>;
  saveApiKey(apiKey: string): Promise<boolean>;
  listConversations(): Promise<AiConversationSummary[]>;
  getConversation(id: string): Promise<AiConversation | null>;
  createConversation(provider: AiProvider, model: string): Promise<AiConversation>;
  saveConversation(conversation: AiConversation): Promise<AiConversation>;
  deleteConversation(id: string): Promise<void>;
}
