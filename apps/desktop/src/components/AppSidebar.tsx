import {
  BarChart3,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  Kanban,
  ListTodo,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { IconButton } from "@task-manager/ui";
import { useTasksStore, useUiStore, type ViewName } from "../stores";
import { rootProjectIdOf } from "../lib/taskViewModel";

const SIDEBAR_COLLAPSED_KEY = "task-manager:sidebar-collapsed";

const NAV_ITEMS: { id: string; view: ViewName; label: string; icon: ReactNode }[] = [
  { id: "tasks", view: "tasks", label: "列表", icon: <ListTodo size={18} /> },
  { id: "inbox", view: "inbox", label: "收件箱", icon: <Inbox size={18} /> },
  { id: "board", view: "board", label: "看板", icon: <Kanban size={18} /> },
  { id: "ai", view: "ai", label: "AI 助手", icon: <Bot size={18} /> },
  { id: "reports", view: "reports", label: "报表", icon: <BarChart3 size={18} /> },
  { id: "trash", view: "trash", label: "回收站", icon: <Trash2 size={18} /> },
  { id: "settings", view: "settings", label: "设置", icon: <Settings size={18} /> },
];

function loadCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

export function AppSidebar() {
  const view = useUiStore((s) => s.view);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setView = useUiStore((s) => s.setView);
  const enterInbox = useUiStore((s) => s.enterInbox);
  const closeSidebar = useUiStore((s) => s.closeSidebar);
  const tasks = useTasksStore((s) => s.allTasks);
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  const activeTasks = tasks.filter((task) => !task.archivedAt && !task.deletedAt);
  const counts: Record<string, number> = {
    tasks: activeTasks.length,
    inbox: activeTasks.filter((task) => !rootProjectIdOf(task, activeTasks)).length,
    board: activeTasks.filter((task) => task.status === "in_progress").length,
  };

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <>
      {sidebarOpen ? (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
      ) : null}
      <aside
        className={[
          "app-sidebar",
          sidebarOpen ? "app-sidebar--open" : "",
          collapsed ? "app-sidebar--collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="主导航"
      >
        <div className="app-sidebar__brand">
          <span className="app-sidebar__logo">TaskCrate</span>
          <IconButton
            size="sm"
            label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            className="sidebar-collapse"
            onClick={toggleCollapsed}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </IconButton>
          <button
            type="button"
            className="sidebar-close"
            onClick={closeSidebar}
            aria-label="关闭菜单"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="app-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.view ? "ui-nav-item ui-nav-item--active" : "ui-nav-item"}
              aria-current={view === item.view ? "page" : undefined}
              title={item.label}
              onClick={() => (item.view === "inbox" ? enterInbox() : setView(item.view))}
            >
              {item.icon}
              <span className="ui-nav-item__label">{item.label}</span>
              {counts[item.id] ? (
                <span className="ui-nav-item__count">{counts[item.id]}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="app-sidebar__footer">v0.1.0 · 桌面端</div>
      </aside>
    </>
  );
}
