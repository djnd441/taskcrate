import type { Tag, TagCreateInput, TagUpdateInput } from "@task-manager/domain";
import { create } from "zustand";
import { getAdapters } from "../adapters";
import { useTasksStore } from "./tasksStore";

export interface TagsState {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  loadTags: () => Promise<void>;
  createTag: (input: TagCreateInput) => Promise<Tag>;
  updateTag: (id: string, input: TagUpdateInput) => Promise<Tag>;
  deleteTag: (id: string) => Promise<void>;
}

export const useTagsStore = create<TagsState>((set, get) => ({
  tags: [],
  loading: false,
  error: null,

  async loadTags() {
    set({ loading: true, error: null });
    try {
      const tags = await getAdapters().tags.list();
      set({ tags });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  async createTag(input) {
    const tag = await getAdapters().tags.create(input);
    await get().loadTags();
    return tag;
  },

  async updateTag(id, input) {
    const tag = await getAdapters().tags.update(id, input);
    await get().loadTags();
    return tag;
  },

  async deleteTag(id) {
    await getAdapters().tags.delete(id);
    await get().loadTags();
    await useTasksStore.getState().refreshTasks();
  },
}));
