import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AuditLog,
  AiChatMessage,
  AiChatResult,
  AiStreamChunk,
  AiConnectionResult,
  AiConversation,
  AiConversationSummary,
  AiProvider,
  BackupInfo,
  BackupSummary,
  ExportResult,
  ImportResult,
  Project,
  ProjectCreateInput,
  ProjectMember,
  ProjectMemberInput,
  ProjectUpdateInput,
  Settings,
  SettingsPatch,
  PackageResult,
  Tag,
  TagCreateInput,
  TagUpdateInput,
  Task,
  TaskAttachment,
  TaskComment,
  LibraryResource,
  TaskCommentInput,
  TaskCreateInput,
  TaskFilter,
  TaskPage,
  TaskSort,
  TaskStatus,
  TaskTemplate,
  TaskTemplateInput,
  TaskUpdateInput,
  TaskPriority,
  UpdateStatus,
} from "@task-manager/domain";

export interface HealthInfo {
  name: string;
  version: string;
  schemaVersion: number;
  dataDir: string;
}

export function healthCheck(): Promise<HealthInfo> {
  return invoke("health_check");
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export function updateSettings(patch: SettingsPatch): Promise<Settings> {
  return invoke("update_settings", { patch });
}

export function playReminderSound(): Promise<void> {
  return invoke("play_reminder_sound");
}

export function setScheduledReminders(enabled: boolean): Promise<string> {
  return invoke("set_scheduled_reminders", { enabled });
}
export function aiChat(
  messages: AiChatMessage[],
  onStream?: (chunk: AiStreamChunk) => void,
): Promise<AiChatResult> {
  const channel = new Channel<AiStreamChunk>();
  if (onStream) {
    channel.onmessage = (chunk) => onStream(chunk);
  }
  return invoke("ai_chat", { messages, channel });
}

export function aiExecuteTool(
  name: string,
  args: Record<string, unknown>,
  confirmed: boolean,
): Promise<string> {
  return invoke("ai_execute_tool", { name, args, confirmed });
}

export function aiTestConnection(): Promise<AiConnectionResult> {
  return invoke("ai_test_connection");
}

export function aiGetConfig(): Promise<Settings> {
  return invoke("ai_get_config");
}

export function aiSaveApiKey(apiKey: string): Promise<boolean> {
  return invoke("ai_save_api_key", { apiKey });
}

export function listAiConversations(): Promise<AiConversationSummary[]> {
  return invoke("list_ai_conversations");
}

export function getAiConversation(id: string): Promise<AiConversation | null> {
  return invoke("get_ai_conversation", { id });
}

export function createAiConversation(
  provider: AiProvider,
  model: string,
): Promise<AiConversation> {
  return invoke("create_ai_conversation", { provider, model });
}

export function saveAiConversation(conversation: AiConversation): Promise<AiConversation> {
  return invoke("save_ai_conversation", { conversation });
}

export function deleteAiConversation(id: string): Promise<void> {
  return invoke("delete_ai_conversation", { id });
}

export function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  return invoke("list_task_attachments", { taskId });
}

export function countTaskAttachments(taskIds: string[]): Promise<Record<string, number>> {
  return invoke("count_task_attachments", { taskIds });
}

export function addTaskAttachment(taskId: string, sourcePath: string): Promise<TaskAttachment> {
  return invoke("add_task_attachment", { taskId, sourcePath });
}

export function deleteTaskAttachment(id: string): Promise<void> {
  return invoke("delete_task_attachment", { id });
}

export function listLibraryResources(): Promise<LibraryResource[]> {
  return invoke("list_library_resources");
}

export function addLibraryResource(sourcePath: string): Promise<LibraryResource> {
  return invoke("add_library_resource", { sourcePath });
}

export function deleteLibraryResource(id: string): Promise<void> {
  return invoke("delete_library_resource", { id });
}

export function copyLibraryResourceToTask(
  libraryId: string,
  taskId: string,
): Promise<TaskAttachment> {
  return invoke("copy_library_resource_to_task", { libraryId, taskId });
}

export function packageTask(taskId: string, outputPath: string): Promise<PackageResult> {
  return invoke("package_task", { taskId, outputPath });
}

export function listProjects(includeArchived = false): Promise<Project[]> {
  return invoke("list_projects", { includeArchived });
}

export function getProject(id: string): Promise<Project | null> {
  return invoke("get_project", { id });
}

export function createProject(input: ProjectCreateInput): Promise<Project> {
  return invoke("create_project", { input });
}

export function updateProject(id: string, input: ProjectUpdateInput): Promise<Project> {
  return invoke("update_project", { id, input });
}

export function archiveProject(id: string): Promise<Project> {
  return invoke("archive_project", { id });
}

export function deleteProject(id: string): Promise<void> {
  return invoke("delete_project", { id });
}

export function listTags(): Promise<Tag[]> {
  return invoke("list_tags");
}

export function getTag(id: string): Promise<Tag | null> {
  return invoke("get_tag", { id });
}

export function createTag(input: TagCreateInput): Promise<Tag> {
  return invoke("create_tag", { input });
}

export function updateTag(id: string, input: TagUpdateInput): Promise<Tag> {
  return invoke("update_tag", { id, input });
}

export function deleteTag(id: string): Promise<void> {
  return invoke("delete_tag", { id });
}

export function listTasks(
  filter?: TaskFilter,
  sort?: TaskSort,
  offset = 0,
  limit = 100,
): Promise<TaskPage> {
  return invoke("list_tasks", {
    filter: { includeArchived: false, includeDeleted: false, ...filter },
    sort,
    offset,
    limit,
  });
}

export function getTask(id: string): Promise<Task | null> {
  return invoke("get_task", { id });
}

export function createTask(input: TaskCreateInput): Promise<Task> {
  return invoke("create_task", { input });
}

export function updateTask(id: string, input: TaskUpdateInput): Promise<Task> {
  return invoke("update_task", { id, input });
}

export function transitionTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  return invoke("transition_task_status", { id, status });
}

export function archiveTask(id: string): Promise<Task> {
  return invoke("archive_task", { id });
}

export function unarchiveTask(id: string): Promise<Task> {
  return invoke("unarchive_task", { id });
}

export function softDeleteTask(id: string): Promise<Task> {
  return invoke("soft_delete_task", { id });
}

export function restoreTask(id: string): Promise<Task> {
  return invoke("restore_task", { id });
}

export function hardDeleteTask(id: string): Promise<void> {
  return invoke("hard_delete_task", { id });
}

export function listDueReminders(before?: string, limit?: number): Promise<Task[]> {
  return invoke("list_due_reminders", { before, limit });
}

export function batchCompleteTasks(ids: string[]): Promise<number> {
  return invoke("batch_complete_tasks", { ids });
}

export function batchSoftDeleteTasks(ids: string[]): Promise<number> {
  return invoke("batch_soft_delete_tasks", { ids });
}

export function batchRestoreTasks(ids: string[]): Promise<number> {
  return invoke("batch_restore_tasks", { ids });
}

export function batchHardDeleteTasks(ids: string[]): Promise<number> {
  return invoke("batch_hard_delete_tasks", { ids });
}

export function clearTrash(): Promise<number> {
  return invoke("clear_trash");
}

export function batchSetPriority(ids: string[], priority: TaskPriority): Promise<number> {
  return invoke("batch_set_priority", { ids, priority });
}

export function batchSetProject(ids: string[], projectId: string | null): Promise<number> {
  return invoke("batch_set_project", { ids, projectId });
}

export function batchAddTags(ids: string[], tagIds: string[]): Promise<number> {
  return invoke("batch_add_tags", { ids, tagIds });
}

export function backupNow(): Promise<BackupInfo> {
  return invoke("backup_now");
}

export function restoreBackup(backupPath: string, replace: boolean): Promise<ImportResult> {
  return invoke("restore_backup", { backupPath, replace });
}

export function listBackups(): Promise<BackupSummary> {
  return invoke("list_backups");
}

export function exportJson(filePath: string): Promise<ExportResult> {
  return invoke("export_json", { filePath });
}

export function exportCsv(filePath: string): Promise<ExportResult> {
  return invoke("export_csv", { filePath });
}

export function exportExcel(filePath: string): Promise<ExportResult> {
  return invoke("export_excel", { filePath });
}

export function importExcel(filePath: string): Promise<ImportResult> {
  return invoke("import_excel", { filePath });
}

export function importCsv(filePath: string): Promise<ImportResult> {
  return invoke("import_csv", { filePath });
}
export function importJson(filePath: string, replace: boolean): Promise<ImportResult> {
  return invoke("import_json", { filePath, replace });
}

export function importJsonText(jsonText: string, replace: boolean): Promise<ImportResult> {
  return invoke("import_json_text", { jsonText, replace });
}

export function exportShareTask(taskId: string, outputPath: string): Promise<ExportResult> {
  return invoke("export_share_task", { taskId, outputPath });
}

export function importShareFile(filePath: string, projectId?: string | null): Promise<ImportResult> {
  return invoke("import_share_file", { filePath, projectId: projectId ?? null });
}

export function importShareJsonText(
  jsonText: string,
  projectId?: string | null,
): Promise<ImportResult> {
  return invoke("import_share_json_text", { jsonText, projectId: projectId ?? null });
}
export function listAuditLogs(limit = 200): Promise<AuditLog[]> {
  return invoke("list_audit_logs", { limit });
}
export function listTaskComments(taskId: string): Promise<TaskComment[]> {
  return invoke("list_task_comments", { taskId });
}

export function addTaskComment(input: TaskCommentInput): Promise<TaskComment> {
  return invoke("add_task_comment", { input });
}

export function deleteTaskComment(id: string): Promise<void> {
  return invoke("delete_task_comment", { id });
}

export function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  return invoke("list_project_members", { projectId });
}

export function addProjectMember(input: ProjectMemberInput): Promise<ProjectMember> {
  return invoke("add_project_member", { input });
}

export function deleteProjectMember(id: string): Promise<void> {
  return invoke("delete_project_member", { id });
}

export function sendTestNotification(): Promise<string> {
  return invoke("send_test_notification");
}
export function listTaskTemplates(): Promise<TaskTemplate[]> {
  return invoke("list_task_templates");
}

export function getTaskTemplate(id: string): Promise<TaskTemplate | null> {
  return invoke("get_task_template", { id });
}

export function createTaskTemplate(input: TaskTemplateInput): Promise<TaskTemplate> {
  return invoke("create_task_template", { input });
}

export function exportTaskTemplateJson(templateId: string): Promise<string> {
  return invoke("export_task_template_json", { templateId });
}

export function importTaskTemplateJson(jsonText: string): Promise<TaskTemplate> {
  return invoke("import_task_template_json", { jsonText });
}

export function exportTaskTemplateFile(
  templateId: string,
  outputPath: string,
): Promise<void> {
  return invoke("export_task_template_file", { templateId, outputPath });
}

export function importTaskTemplateFile(filePath: string): Promise<TaskTemplate> {
  return invoke("import_task_template_file", { filePath });
}
export function deleteTaskTemplate(id: string): Promise<void> {
  return invoke("delete_task_template", { id });
}

export function createCaptureTask(title: string): Promise<Task> {
  return invoke("create_capture_task", { title });
}
export function checkUpdate(): Promise<UpdateStatus> {
  return invoke("check_update");
}
