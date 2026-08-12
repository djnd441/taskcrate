import type { ExportResult, TaskTemplate, TaskTemplateInput } from "@task-manager/domain";
import { create } from "zustand";
import { getAdapters } from "../adapters";

export interface TemplatesState {
  templates: TaskTemplate[];
  loading: boolean;
  error: string | null;
  loadTemplates: () => Promise<void>;
  createTemplate: (input: TaskTemplateInput) => Promise<TaskTemplate>;
  deleteTemplate: (id: string) => Promise<void>;
  exportTemplateJsonText: (id: string) => Promise<string>;
  importTemplateJsonText: (jsonText: string) => Promise<TaskTemplate>;
  exportTemplateFile: (id: string) => Promise<ExportResult>;
  importTemplateFile: () => Promise<TaskTemplate | null>;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,

  async loadTemplates() {
    set({ loading: true, error: null });
    try {
      const templates = await getAdapters().templates.list();
      set({ templates });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  async createTemplate(input) {
    const template = await getAdapters().templates.create(input);
    await get().loadTemplates();
    return template;
  },

  async deleteTemplate(id) {
    await getAdapters().templates.delete(id);
    await get().loadTemplates();
  },

  exportTemplateJsonText(id) {
    return getAdapters().templates.exportJsonText(id);
  },

  async importTemplateJsonText(jsonText) {
    const template = await getAdapters().templates.importJsonText(jsonText);
    await get().loadTemplates();
    return template;
  },

  exportTemplateFile(id) {
    return getAdapters().templates.exportFile(id);
  },

  async importTemplateFile() {
    const template = await getAdapters().templates.importFile();
    if (template) {
      await get().loadTemplates();
    }
    return template;
  },
}));