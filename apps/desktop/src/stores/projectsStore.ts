import type { Project, ProjectCreateInput, ProjectUpdateInput } from "@task-manager/domain";
import { create } from "zustand";
import { getAdapters } from "../adapters";

export interface ProjectsState {
  projects: Project[];
  loading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  createProject: (input: ProjectCreateInput) => Promise<Project>;
  updateProject: (id: string, input: ProjectUpdateInput) => Promise<Project>;
  archiveProject: (id: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  async loadProjects() {
    set({ loading: true, error: null });
    try {
      const projects = await getAdapters().projects.list();
      set({ projects });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  async createProject(input) {
    const project = await getAdapters().projects.create(input);
    await get().loadProjects();
    return project;
  },

  async updateProject(id, input) {
    const project = await getAdapters().projects.update(id, input);
    await get().loadProjects();
    return project;
  },

  async archiveProject(id) {
    const project = await getAdapters().projects.archive(id);
    await get().loadProjects();
    return project;
  },

  async deleteProject(id) {
    await getAdapters().projects.delete(id);
    await get().loadProjects();
  },
}));
