import type {
  Task,
  TaskCreateInput,
  TaskFilter,
  TaskSort,
  TaskStatus,
  TaskUpdateInput,
} from "@task-manager/domain";
import { create } from "zustand";
import { getAdapters } from "../adapters";

export interface TasksState {
  tasks: Task[];
  allTasks: Task[];
  total: number;
  offset: number;
  limit: number;
  loading: boolean;
  error: string | null;
  selectedIds: string[];
  filter: TaskFilter;
  sort: TaskSort;
  loadTasks: () => Promise<void>;
  loadAllTasks: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  createTask: (input: TaskCreateInput) => Promise<Task>;
  updateTask: (id: string, input: TaskUpdateInput) => Promise<Task>;
  transitionStatus: (id: string, status: TaskStatus) => Promise<Task>;
  archive: (id: string) => Promise<Task>;
  unarchive: (id: string) => Promise<Task>;
  softDelete: (id: string) => Promise<Task>;
  restore: (id: string) => Promise<Task>;
  hardDelete: (id: string) => Promise<void>;
  setFilter: (filter: TaskFilter) => void;
  setSort: (sort: TaskSort) => void;
  toggleSelect: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  selectVisible: () => void;
  clearSelection: () => void;
  batchComplete: (ids: string[]) => Promise<number>;
  batchSoftDelete: (ids: string[]) => Promise<number>;
  batchRestore: (ids: string[]) => Promise<number>;
  batchHardDelete: (ids: string[]) => Promise<number>;
  batchSetPriority: (ids: string[], priority: Task["priority"]) => Promise<number>;
  batchSetProject: (ids: string[], projectId: string | null) => Promise<number>;
  batchAddTags: (ids: string[], tagIds: string[]) => Promise<number>;
  clearError: () => void;
}

const defaultSort: TaskSort = { field: "createdAt", direction: "asc" };

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  allTasks: [],
  total: 0,
  offset: 0,
  limit: 10000,
  loading: false,
  error: null,
  selectedIds: [],
  filter: {},
  sort: defaultSort,

  async loadTasks() {
    const { filter, sort, offset, limit } = get();
    set({ loading: true, error: null });
    try {
      const page = await getAdapters().tasks.list(filter, sort, offset, limit);
      set({ tasks: page.items, total: page.total });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  async loadAllTasks() {
    try {
      const page = await getAdapters().tasks.list(
        { includeArchived: false, includeDeleted: false },
        defaultSort,
        0,
        100000,
      );
      set({ allTasks: page.items });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  async refreshTasks() {
    await Promise.all([get().loadTasks(), get().loadAllTasks()]);
  },

  async createTask(input) {
    const task = await getAdapters().tasks.create(input);
    await get().refreshTasks();
    return task;
  },

  async updateTask(id, input) {
    const task = await getAdapters().tasks.update(id, input);
    await get().refreshTasks();
    return task;
  },

  async transitionStatus(id, status) {
    const task = await getAdapters().tasks.transitionStatus(id, status);
    await get().refreshTasks();
    return task;
  },

  async archive(id) {
    const task = await getAdapters().tasks.archive(id);
    await get().refreshTasks();
    return task;
  },

  async unarchive(id) {
    const task = await getAdapters().tasks.unarchive(id);
    await get().refreshTasks();
    return task;
  },

  async softDelete(id) {
    const task = await getAdapters().tasks.softDelete(id);
    await get().refreshTasks();
    return task;
  },

  async restore(id) {
    const task = await getAdapters().tasks.restore(id);
    await get().refreshTasks();
    return task;
  },

  async hardDelete(id) {
    await getAdapters().tasks.hardDelete(id);
    await get().refreshTasks();
  },

  setFilter(filter) {
    set({ filter, offset: 0 });
    void get().loadTasks();
  },

  setSort(sort) {
    set({ sort });
    void get().loadTasks();
  },

  toggleSelect(id) {
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selected) => selected !== id)
        : [...state.selectedIds, id],
    }));
  },

  setSelectedIds(ids) {
    set({ selectedIds: ids });
  },

  selectVisible() {
    set({ selectedIds: get().tasks.map((task) => task.id) });
  },

  clearSelection() {
    set({ selectedIds: [] });
  },

  async batchComplete(ids) {
    const count = await getAdapters().batch.complete(ids);
    set({ selectedIds: [] });
    await get().refreshTasks();
    return count;
  },

  async batchSoftDelete(ids) {
    const count = await getAdapters().batch.softDelete(ids);
    set({ selectedIds: [] });
    await get().refreshTasks();
    return count;
  },

  async batchRestore(ids) {
    const count = await getAdapters().batch.restore(ids);
    set({ selectedIds: [] });
    await get().refreshTasks();
    return count;
  },

  async batchHardDelete(ids) {
    const count = await getAdapters().batch.hardDelete(ids);
    set({ selectedIds: [] });
    await get().refreshTasks();
    return count;
  },

  async batchSetPriority(ids, priority) {
    const count = await getAdapters().batch.setPriority(ids, priority);
    set({ selectedIds: [] });
    await get().refreshTasks();
    return count;
  },

  async batchSetProject(ids, projectId) {
    const count = await getAdapters().batch.setProject(ids, projectId);
    set({ selectedIds: [] });
    await get().refreshTasks();
    return count;
  },

  async batchAddTags(ids, tagIds) {
    const count = await getAdapters().batch.addTags(ids, tagIds);
    set({ selectedIds: [] });
    await get().refreshTasks();
    return count;
  },

  clearError() {
    set({ error: null });
  },
}));
