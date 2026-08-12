import { create } from "zustand";
import type { TaskFilter, TaskSort } from "@task-manager/domain";

export type ViewName = "tasks" | "inbox" | "board" | "trash" | "ai" | "reports" | "settings";

export interface SavedFilterView {
  id: string;
  name: string;
  filter: TaskFilter;
  sort: TaskSort;
}

export interface UiState {
  view: ViewName;
  sidebarOpen: boolean;
  detailOpen: boolean;
  activeTaskId: string | null;
  commandPaletteOpen: boolean;
  quickCreateOpen: boolean;
  quickCreateDraftTitle: string;
  quickCreateRequestToken: number;
  searchFocusToken: number;
  savedViews: SavedFilterView[];
  setView: (view: ViewName) => void;
  enterInbox: () => void;
  exitInbox: () => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setQuickCreateOpen: (open: boolean) => void;
  openQuickCreate: (title?: string) => void;
  closeQuickCreate: () => void;
  requestSearchFocus: () => void;
  saveFilterView: (name: string, filter: TaskFilter, sort: TaskSort) => void;
  deleteFilterView: (id: string) => void;
}

const SAVED_VIEWS_KEY = "task-manager:saved-filter-views";

function loadSavedViews(): SavedFilterView[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedFilterView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedViews(views: SavedFilterView[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
}

export const useUiStore = create<UiState>((set) => ({
  view: "tasks",
  sidebarOpen: false,
  detailOpen: false,
  activeTaskId: null,
  commandPaletteOpen: false,
  quickCreateOpen: false,
  quickCreateDraftTitle: "",
  quickCreateRequestToken: 0,
  searchFocusToken: 0,
  savedViews: loadSavedViews(),

  setView(view) {
    set({ view, sidebarOpen: false, detailOpen: false, activeTaskId: null });
  },

  enterInbox() {
    set({ view: "inbox", sidebarOpen: false, detailOpen: false, activeTaskId: null });
  },

  exitInbox() {
    set({ view: "tasks", detailOpen: false, activeTaskId: null });
  },

  toggleSidebar() {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  closeSidebar() {
    set({ sidebarOpen: false });
  },

  openDetail(id) {
    set({ activeTaskId: id, detailOpen: true });
  },

  closeDetail() {
    set({ detailOpen: false, activeTaskId: null });
  },

  setCommandPaletteOpen(open) {
    set({ commandPaletteOpen: open });
  },

  setQuickCreateOpen(open) {
    set({ quickCreateOpen: open });
  },

  openQuickCreate(title = "") {
    set((state) => ({
      quickCreateDraftTitle: title,
      quickCreateOpen: true,
      quickCreateRequestToken: state.quickCreateRequestToken + 1,
    }));
  },

  closeQuickCreate() {
    set({ quickCreateOpen: false, quickCreateDraftTitle: "" });
  },

  requestSearchFocus() {
    set((state) => ({ searchFocusToken: state.searchFocusToken + 1 }));
  },

  saveFilterView(name, filter, sort) {
    const id = `view-${Date.now()}`;
    set((state) => {
      const views = [...state.savedViews, { id, name, filter, sort }];
      persistSavedViews(views);
      return { savedViews: views };
    });
  },

  deleteFilterView(id) {
    set((state) => {
      const views = state.savedViews.filter((view) => view.id !== id);
      persistSavedViews(views);
      return { savedViews: views };
    });
  },
}));
