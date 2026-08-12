import * as bridge from "../bridge";
import type { AppAdapters } from "./types";
import { open, save } from "@tauri-apps/plugin-dialog";

function defaultExportName(extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `TaskCrate-${stamp}.${extension}`;
}

async function chooseSavePath(extension: string): Promise<string> {
  const selected = await save({
    title: extension === "json" ? "导出 JSON 备份" : "导出 CSV",
    defaultPath: defaultExportName(extension),
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (!selected) {
    throw new Error("已取消导出");
  }
  return selected;
}

async function chooseImportPath(): Promise<string> {
  const selected = await open({
    title: "选择 JSON 备份文件",
    multiple: false,
    directory: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!selected || Array.isArray(selected)) {
    throw new Error("已取消导入");
  }
  return selected;
}

async function chooseDataImportPath(extension: string, title: string): Promise<string> {
  const selected = await open({
    title,
    multiple: false,
    directory: false,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (!selected || Array.isArray(selected)) {
    throw new Error("已取消导入");
  }
  return selected;
}
async function chooseLibraryPath(): Promise<string | null> {
  const selected = await open({
    title: "选择素材文件",
    multiple: false,
    directory: false,
  });
  if (!selected || Array.isArray(selected)) {
    return null;
  }
  return selected;
}

async function chooseAttachmentPaths(): Promise<string[]> {
  const selected = await open({
    title: "选择附件",
    multiple: true,
    directory: false,
  });
  if (!selected) {
    return [];
  }
  return Array.isArray(selected) ? selected : [selected];
}

export const desktopAdapter: AppAdapters = {
  tasks: {
    get: bridge.getTask,
    list: bridge.listTasks,
    create: bridge.createTask,
    update: bridge.updateTask,
    transitionStatus: bridge.transitionTaskStatus,
    archive: bridge.archiveTask,
    unarchive: bridge.unarchiveTask,
    softDelete: bridge.softDeleteTask,
    restore: bridge.restoreTask,
    hardDelete: async (id) => {
      await bridge.hardDeleteTask(id);
    },
  },
  projects: {
    list: (includeArchived = false) => bridge.listProjects(includeArchived),
    get: bridge.getProject,
    create: bridge.createProject,
    update: bridge.updateProject,
    archive: bridge.archiveProject,
    delete: async (id) => {
      await bridge.deleteProject(id);
    },
  },
  tags: {
    list: bridge.listTags,
    get: bridge.getTag,
    create: bridge.createTag,
    update: bridge.updateTag,
    delete: async (id) => {
      await bridge.deleteTag(id);
    },
  },
  settings: {
    get: bridge.getSettings,
    update: bridge.updateSettings,
  },
  ai: {
    chat: bridge.aiChat,
    executeTool: bridge.aiExecuteTool,
    testConnection: bridge.aiTestConnection,
    saveApiKey: bridge.aiSaveApiKey,
    listConversations: bridge.listAiConversations,
    getConversation: bridge.getAiConversation,
    createConversation: bridge.createAiConversation,
    saveConversation: bridge.saveAiConversation,
    deleteConversation: bridge.deleteAiConversation,
  },
  attachments: {
    async pickFiles() {
      const paths = await chooseAttachmentPaths();
      return paths.map((path, index) => ({
        key: `attachment-${Date.now()}-${index}`,
        name: path.split(/[\\/]/).pop() ?? path,
        sizeBytes: 0,
        path,
      }));
    },
    list: bridge.listTaskAttachments,
    counts: bridge.countTaskAttachments,
    async add(taskId, draft) {
      if (!draft.path) {
        throw new Error("当前附件没有可读取的本地路径");
      }
      return bridge.addTaskAttachment(taskId, draft.path);
    },
    remove: bridge.deleteTaskAttachment,
    async package(taskId) {
      const outputPath = await chooseSavePath("zip");
      const result = await bridge.packageTask(taskId, outputPath);
      return result.path;
    },
  },
  library: {
    list: bridge.listLibraryResources,
    async pickFile() {
      const path = await chooseLibraryPath();
      if (!path) {
        return [];
      }
      return [
        {
          key: `library-${Date.now()}`,
          name: path.split(/[\\/]/).pop() ?? path,
          sizeBytes: 0,
          path,
        },
      ];
    },
    async addDraft(draft) {
      if (!draft.path) {
        throw new Error("桌面端素材需要本地文件路径");
      }
      return bridge.addLibraryResource(draft.path);
    },
    remove: async (id) => {
      await bridge.deleteLibraryResource(id);
    },
    copyToTask: bridge.copyLibraryResourceToTask,
  },
  comments: {
    list: bridge.listTaskComments,
    add: bridge.addTaskComment,
    remove: async (id) => {
      await bridge.deleteTaskComment(id);
    },
  },
  projectMembers: {
    list: bridge.listProjectMembers,
    add: bridge.addProjectMember,
    remove: async (id) => {
      await bridge.deleteProjectMember(id);
    },
  },  audit: {
    list: bridge.listAuditLogs,
  },  templates: {
    list: bridge.listTaskTemplates,
    get: bridge.getTaskTemplate,
    create: bridge.createTaskTemplate,
    delete: async (id) => {
      await bridge.deleteTaskTemplate(id);
    },
    exportJsonText: bridge.exportTaskTemplateJson,
    importJsonText: bridge.importTaskTemplateJson,
    async exportFile(templateId) {
      const outputPath = await chooseSavePath("json");
      await bridge.exportTaskTemplateFile(templateId, outputPath);
      return { path: outputPath, count: 1, format: "json" };
    },
    async importFile() {
      const filePath = await chooseImportPath();
      if (!filePath) {
        return null;
      }
      return bridge.importTaskTemplateFile(filePath);
    },
  },  share: {
    async exportTask(taskId) {
      const outputPath = await chooseSavePath("task");
      const result = await bridge.exportShareTask(taskId, outputPath);
      return result;
    },
    async importFile() {
      const filePath = await chooseImportPath();
      return bridge.importShareFile(filePath, null);
    },
    importJsonText: bridge.importShareJsonText,
  },
  reminders: {
    playSound: bridge.playReminderSound,
    setScheduled: bridge.setScheduledReminders,
    sendTestWebhook: bridge.sendTestNotification,
  },
  batch: {
    complete: bridge.batchCompleteTasks,
    softDelete: bridge.batchSoftDeleteTasks,
    restore: bridge.batchRestoreTasks,
    hardDelete: bridge.batchHardDeleteTasks,
    setPriority: bridge.batchSetPriority,
    setProject: bridge.batchSetProject,
    addTags: bridge.batchAddTags,
    clearTrash: bridge.clearTrash,
  },
  data: {
    backupNow: bridge.backupNow,
    listBackups: bridge.listBackups,
    exportJson: async () => bridge.exportJson(await chooseSavePath("json")),
    exportCsv: async () => bridge.exportCsv(await chooseSavePath("csv")),
    exportExcel: async () => bridge.exportExcel(await chooseSavePath("xlsx")),
    importCsvFile: async () => bridge.importCsv(await chooseDataImportPath("csv", "选择 CSV 文件")),
    importExcelFile: async () => bridge.importExcel(await chooseDataImportPath("xlsx", "选择 Excel 文件")),
    importJsonFile: async (replace) => bridge.importJson(await chooseImportPath(), replace),
    importJsonText: bridge.importJsonText,
    async restoreFile() {
      const selected = await open({
        title: "选择备份文件",
        multiple: false,
        directory: false,
        filters: [{ name: "TaskCrate 备份", extensions: ["zip"] }],
      });
      if (!selected || Array.isArray(selected)) {
        throw new Error("已取消恢复");
      }
      return bridge.restoreBackup(selected, true);
    },
    checkUpdate: bridge.checkUpdate,
  },
};
