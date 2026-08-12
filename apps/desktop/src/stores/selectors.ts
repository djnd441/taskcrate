import type { Task } from "@task-manager/domain";
import type { ProjectsState } from "./projectsStore";
import type { SettingsState } from "./settingsStore";
import type { TagsState } from "./tagsStore";
import type { TasksState } from "./tasksStore";

export const selectTasks = (state: TasksState) => state.tasks;
export const selectTasksTotal = (state: TasksState) => state.total;
export const selectTasksLoading = (state: TasksState) => state.loading;
export const selectTaskById =
  (id: string) =>
  (state: TasksState): Task | null =>
    state.tasks.find((task) => task.id === id) ?? null;

export const selectAllTaskById =
  (id: string) =>
  (state: TasksState): Task | null =>
    state.allTasks.find((task) => task.id === id) ?? null;

export const selectProjects = (state: ProjectsState) => state.projects;
export const selectProjectName = (id: string | null) => (state: ProjectsState) =>
  id ? (state.projects.find((project) => project.id === id)?.name ?? "未分类") : "未分类";

export const selectTags = (state: TagsState) => state.tags;
export const selectSettings = (state: SettingsState) => state.settings;
export const selectTheme = (state: SettingsState) => state.settings?.theme ?? "system";
