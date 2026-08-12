import type { AppAdapters } from "./types";
import { desktopAdapter } from "./desktopAdapter";
import { indexedDbAdapter } from "./indexedDbAdapter";
import { mockAdapter } from "./mockAdapter";

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

function isWebPreview(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean((window as unknown as Record<string, unknown>).__TASK_MANAGER_WEB__);
}

export const adapters: AppAdapters = isTauriRuntime()
  ? desktopAdapter
  : isWebPreview()
    ? indexedDbAdapter
    : mockAdapter;

export function getAdapters(): AppAdapters {
  return adapters;
}
