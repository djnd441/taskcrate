/// <reference types="vite/client" />

declare global {
  interface Window {
    __TASK_MANAGER_WEB__?: boolean;
  }
}

export {};
