import type { BackupInfo, BackupSummary, ExportResult, ImportResult } from "@task-manager/domain";
import { create } from "zustand";
import { getAdapters } from "../adapters";
import { useProjectsStore } from "./projectsStore";
import { useSettingsStore } from "./settingsStore";
import { useTagsStore } from "./tagsStore";
import { useTasksStore } from "./tasksStore";

export interface DataState {
  summary: BackupSummary | null;
  loading: boolean;
  error: string | null;
  loadBackups: () => Promise<void>;
  backupNow: () => Promise<BackupInfo>;
  exportJson: () => Promise<ExportResult>;
  exportCsv: () => Promise<ExportResult>;
  exportExcel: () => Promise<ExportResult>;
  importCsvFile: () => Promise<ImportResult>;
  importExcelFile: () => Promise<ImportResult>;
  importJsonFile: (replace: boolean) => Promise<ImportResult>;
  importJsonText: (text: string, replace: boolean) => Promise<ImportResult>;
  restoreBackupFile: () => Promise<ImportResult>;
}

export const useDataStore = create<DataState>((set, get) => ({
  summary: null,
  loading: false,
  error: null,

  async loadBackups() {
    set({ loading: true, error: null });
    try {
      const summary = await getAdapters().data.listBackups();
      set({ summary });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  async backupNow() {
    const info = await getAdapters().data.backupNow();
    await useSettingsStore.getState().updateSettings({ lastBackupAt: info.createdAt });
    await get().loadBackups();
    return info;
  },

  async exportJson() {
    const result = await getAdapters().data.exportJson();
    await get().loadBackups();
    return result;
  },

  async exportCsv() {
    return getAdapters().data.exportCsv();
  },

  async exportExcel() {
    const result = await getAdapters().data.exportExcel();
    await get().loadBackups();
    return result;
  },

  async importCsvFile() {
    const result = await getAdapters().data.importCsvFile();
    await refreshAfterImport();
    return result;
  },

  async importExcelFile() {
    const result = await getAdapters().data.importExcelFile();
    await refreshAfterImport();
    return result;
  },

  async importJsonFile(replace) {
    const result = await getAdapters().data.importJsonFile(replace);
    await refreshAfterImport();
    await get().loadBackups();
    return result;
  },

  async importJsonText(text, replace) {
    const result = await getAdapters().data.importJsonText(text, replace);
    await refreshAfterImport();
    await get().loadBackups();
    return result;
  },

  async restoreBackupFile() {
    const result = await getAdapters().data.restoreFile();
    await refreshAfterImport();
    await get().loadBackups();
    return result;
  },
}));

async function refreshAfterImport(): Promise<void> {
  await Promise.all([
    useProjectsStore.getState().loadProjects(),
    useTagsStore.getState().loadTags(),
    useTasksStore.getState().refreshTasks(),
    useSettingsStore.getState().loadSettings(),
  ]);
}
