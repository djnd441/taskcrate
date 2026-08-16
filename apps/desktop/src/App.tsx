import { Menu, Moon, Plus, Search, Sun } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { Button, IconButton, ToastProvider } from "@task-manager/ui";
import { AppSidebar } from "./components/AppSidebar";
import { CommandPalette } from "./components/CommandPalette";
import { DetailPanel } from "./components/DetailPanel";
import { HelpMenu } from "./components/HelpMenu";
import { InboxView } from "./components/InboxView";
import { QuickCreateModal } from "./components/QuickCreateModal";
import { GlobalCapture } from "./components/GlobalCapture";
import { TopbarOverview, type OverviewKind } from "./components/TopbarOverview";
import { initializeNotifications } from "./notifications/notifier";
import { registerShortcut } from "./shortcuts/shortcuts";
import {
  useProjectsStore,
  useSettingsStore,
  useTagsStore,
  useTasksStore,
  useUiStore,
} from "./stores";
import { selectTheme } from "./stores/selectors";
import { isTaskOverdue } from "./lib/taskViewModel";
import { TaskListView } from "./views/TaskListView";

const BoardView = lazy(() =>
  import("./views/BoardView").then((module) => ({ default: module.BoardView })),
);
const AiView = lazy(() => import("./views/AiView").then((module) => ({ default: module.AiView })));
const ReportsView = lazy(() =>
  import("./views/ReportsView").then((module) => ({ default: module.ReportsView })),
);
const SettingsView = lazy(() =>
  import("./views/SettingsView").then((module) => ({ default: module.SettingsView })),
);
const TrashView = lazy(() =>
  import("./views/TrashView").then((module) => ({ default: module.TrashView })),
);

const VIEW_TITLES = {
  tasks: "任务列表",
  inbox: "收件箱",
  board: "看板",
  trash: "回收站",
  ai: "AI 助手",
  reports: "报表",
  settings: "设置",
} as const;

function AppContent() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const openQuickCreate = useUiStore((s) => s.openQuickCreate);
  const theme = useSettingsStore(selectTheme);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const loadProjects = useProjectsStore((s) => s.loadProjects);
  const loadTags = useTagsStore((s) => s.loadTags);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const loadAllTasks = useTasksStore((s) => s.loadAllTasks);
  const tasks = useTasksStore((s) => s.allTasks);
  const setFilter = useTasksStore((s) => s.setFilter);

  const overview = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    const active = tasks.filter((task) => !task.archivedAt && !task.deletedAt);
    const todayCount = active.filter((task) => {
      if (!task.dueAt || task.status === "completed" || task.status === "cancelled") {
        return false;
      }
      const due = new Date(task.dueAt).getTime();
      return due >= start.getTime() && due <= end.getTime();
    }).length;
    const overdueCount = active.filter((task) => isTaskOverdue(task, now.getTime())).length;
    const inProgressCount = active.filter((task) => task.status === "in_progress").length;
    return { todayCount, overdueCount, inProgressCount };
  }, [tasks]);

  useEffect(() => {
    void Promise.all([loadProjects(), loadTags(), loadSettings(), loadTasks(), loadAllTasks()]);
    void initializeNotifications();
  }, [loadProjects, loadTags, loadSettings, loadTasks, loadAllTasks]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("taskcrate:data-changed", () => {
          void Promise.all([
            loadProjects(),
            loadTags(),
            loadSettings(),
            loadTasks(),
            loadAllTasks(),
          ]);
        }),
      )
      .then((cleanup) => {
        unlisten = cleanup;
      });
    return () => unlisten?.();
  }, [loadProjects, loadTags, loadSettings, loadTasks, loadAllTasks]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("taskcrate:open-quick-create", (event) => {
          const payload = event.payload as { title?: string } | undefined;
          const ui = useUiStore.getState();
          ui.setView("tasks");
          ui.openQuickCreate(payload?.title ?? "");
        }),
      )
      .then((cleanup) => {
        unlisten = cleanup;
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.setAttribute("data-theme", resolved);
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    const cleanups = [
      registerShortcut({
        id: "open-quick-create",
        key: "n",
        ctrlKey: true,
        handler: () => useUiStore.getState().openQuickCreate(),
        when: () => !useUiStore.getState().commandPaletteOpen,
      }),
      registerShortcut({
        id: "toggle-command-palette",
        key: "k",
        ctrlKey: true,
        handler: () => {
          const ui = useUiStore.getState();
          ui.setCommandPaletteOpen(!ui.commandPaletteOpen);
        },
      }),
      registerShortcut({
        id: "close-overlays",
        key: "Escape",
        handler: () => {
          const ui = useUiStore.getState();
          ui.setCommandPaletteOpen(false);
          ui.closeQuickCreate();
          ui.closeDetail();
        },
      }),
      registerShortcut({
        id: "view-tasks",
        key: "1",
        ctrlKey: true,
        handler: () => useUiStore.getState().setView("tasks"),
      }),
      registerShortcut({
        id: "view-board",
        key: "2",
        ctrlKey: true,
        handler: () => useUiStore.getState().setView("board"),
      }),
      registerShortcut({
        id: "view-trash",
        key: "3",
        ctrlKey: true,
        handler: () => useUiStore.getState().setView("trash"),
      }),
      registerShortcut({
        id: "view-settings",
        key: "4",
        ctrlKey: true,
        handler: () => useUiStore.getState().setView("settings"),
      }),
      registerShortcut({
        id: "search-tasks",
        key: "f",
        ctrlKey: true,
        shiftKey: true,
        handler: () => {
          const ui = useUiStore.getState();
          ui.setView("tasks");
          ui.requestSearchFocus();
        },
      }),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  const toggleTheme = async () => {
    const current = settings?.theme ?? "system";
    const resolved =
      current === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : current;
    await updateSettings({ theme: resolved === "dark" ? "light" : "dark" });
  };

  const handleOverviewSelect = (kind: OverviewKind) => {
    setView("tasks");
    if (kind === "today") {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      setFilter({ dueFrom: start.toISOString(), dueUntil: end.toISOString() });
      return;
    }
    if (kind === "overdue") {
      setFilter({ dueUntil: new Date().toISOString(), statuses: ["todo", "in_progress"] });
      return;
    }
    setFilter({ statuses: ["in_progress"] });
  };

  const renderView = () => {
    switch (view) {
      case "inbox":
        return <InboxView />;
      case "board":
        return <BoardView />;
      case "trash":
        return <TrashView />;
      case "ai":
        return <AiView />;
      case "reports":
        return <ReportsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <TaskListView />;
    }
  };

  const resolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar__left">
            <IconButton label="打开菜单" className="menu-toggle" onClick={toggleSidebar}>
              <Menu size={18} />
            </IconButton>
            <h1 className="app-topbar__title">{VIEW_TITLES[view]}</h1>
          </div>
          <div className="app-topbar__center">
            <TopbarOverview
              todayCount={overview.todayCount}
              overdueCount={overview.overdueCount}
              inProgressCount={overview.inProgressCount}
              onSelect={handleOverviewSelect}
            />
          </div>
          <div className="app-topbar__right">
            <Button variant="secondary" onClick={() => setCommandPaletteOpen(true)}>
              <Search size={15} />
              搜索
            </Button>
            <HelpMenu />
            <IconButton label="切换主题" onClick={() => void toggleTheme()}>
              {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </IconButton>
            <Button onClick={() => openQuickCreate()}>
              <Plus size={15} />
              新建主任务
            </Button>
          </div>
        </header>
        <main className="app-content">
          <Suspense fallback={<div className="view-loading">加载中...</div>}>
            {renderView()}
          </Suspense>
        </main>
      </div>
      <DetailPanel />
      <CommandPalette />
      <QuickCreateModal />
    </div>
  );
}

export default function App() {
  const isCaptureWindow =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("capture");
  if (isCaptureWindow) {
    return <GlobalCapture />;
  }
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
