import React from "react";
import ReactDOM from "react-dom/client";
import "@task-manager/ui/tokens.css";
import "@task-manager/ui/styles.css";
import "@task-manager/desktop/app-styles.css";
import "@task-manager/desktop/ui-refresh.css";
import "@task-manager/desktop/ui-refresh-mobile.css";
import "@task-manager/desktop/ui-refresh-board.css";
import "@task-manager/desktop/ui-refresh-detail.css";
import "@task-manager/desktop/ui-refresh-pages.css";
import "./styles.css";

async function boot(): Promise<void> {
  window.__TASK_MANAGER_WEB__ = true;
  const { default: App } = await import("@task-manager/desktop/app");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
