import { create } from "zustand";
import type { LibraryResource, TaskAttachment } from "@task-manager/domain";
import { getAdapters } from "../adapters";
import type { AttachmentDraft } from "../adapters/types";

interface LibraryState {
  items: LibraryResource[];
  loading: boolean;
  error: string | null;
  loadLibrary: () => Promise<void>;
  addDraft: (draft: AttachmentDraft) => Promise<LibraryResource>;
  remove: (id: string) => Promise<void>;
  copyToTask: (libraryId: string, taskId: string) => Promise<TaskAttachment>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  async loadLibrary() {
    set({ loading: true, error: null });
    try {
      const items = await getAdapters().library.list();
      set({ items });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  async addDraft(draft) {
    const resource = await getAdapters().library.addDraft(draft);
    set({ items: [resource, ...get().items] });
    return resource;
  },

  async remove(id) {
    await getAdapters().library.remove(id);
    set({ items: get().items.filter((item) => item.id !== id) });
  },

  async copyToTask(libraryId, taskId) {
    const attachment = await getAdapters().library.copyToTask(libraryId, taskId);
    return attachment;
  },
}));
