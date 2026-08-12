import type { Settings, SettingsPatch } from "@task-manager/domain";
import { create } from "zustand";
import { getAdapters } from "../adapters";

export interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: SettingsPatch) => Promise<Settings>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  error: null,

  async loadSettings() {
    set({ loading: true, error: null });
    try {
      const settings = await getAdapters().settings.get();
      set({ settings });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  async updateSettings(patch) {
    const settings = await getAdapters().settings.update(patch);
    set({ settings });
    return settings;
  },
}));
