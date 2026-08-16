import {
  BarChart3,
  Bot,
  Inbox,
  Kanban,
  ListTodo,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Input, Modal } from "@task-manager/ui";
import { shouldIgnoreEnter } from "../lib/ime";
import { useTasksStore, useUiStore } from "../stores";

interface PaletteEntry {
  id: string;
  label: string;
  icon: ReactNode;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setView = useUiStore((s) => s.setView);
  const requestSearchFocus = useUiStore((s) => s.requestSearchFocus);
  const openDetail = useUiStore((s) => s.openDetail);
  const tasks = useTasksStore((s) => s.allTasks);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const items = useMemo(
    () => [
      {
        label: "搜索任务",
        hint: "聚焦搜索",
        icon: <Search size={15} />,
        run: () => {
          setOpen(false);
          setView("tasks");
          requestSearchFocus();
        },
      },
      {
        label: "新建任务",
        hint: "Ctrl+N",
        icon: <Plus size={15} />,
        run: () => {
          setOpen(false);
          useUiStore.getState().openQuickCreate();
        },
      },
      {
        label: "任务列表",
        hint: "视图",
        icon: <ListTodo size={15} />,
        run: () => {
          setOpen(false);
          setView("tasks");
        },
      },
      {
        label: "看板",
        hint: "视图",
        icon: <Kanban size={15} />,
        run: () => {
          setOpen(false);
          setView("board");
        },
      },
      {
        label: "回收站",
        hint: "视图",
        icon: <Trash2 size={15} />,
        run: () => {
          setOpen(false);
          setView("trash");
        },
      },
      {
        label: "收件箱",
        hint: "视图",
        icon: <Inbox size={15} />,
        run: () => {
          setOpen(false);
          useUiStore.getState().enterInbox();
        },
      },
      {
        label: "AI 助手",
        hint: "视图",
        icon: <Bot size={15} />,
        run: () => {
          setOpen(false);
          setView("ai");
        },
      },
      {
        label: "报表",
        hint: "视图",
        icon: <BarChart3 size={15} />,
        run: () => {
          setOpen(false);
          setView("reports");
        },
      },
      {
        label: "设置",
        hint: "视图",
        icon: <Settings size={15} />,
        run: () => {
          setOpen(false);
          setView("settings");
        },
      },
    ],
    [openDetail, requestSearchFocus, setOpen, setView],
  );

  const keyword = query.trim().toLowerCase();
  const filtered = items.filter((item) => item.label.toLowerCase().includes(keyword));
  const taskResults = keyword
    ? tasks
        .filter((task) => `${task.title} ${task.notes ?? ""}`.toLowerCase().includes(keyword))
        .slice(0, 8)
    : [];
  const taskEntries: PaletteEntry[] = taskResults.map((task) => ({
    id: `task-${task.id}`,
    label: task.title,
    icon: <ListTodo size={15} />,
    run: () => {
      setOpen(false);
      openDetail(task.id);
    },
  }));
  const entries = useMemo(
    () => [
      ...taskEntries,
      ...filtered.map((item) => ({
        id: item.label,
        label: item.label,
        icon: item.icon,
        hint: item.hint,
        run: item.run,
      })),
    ],
    [filtered, taskEntries],
  );

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(entries.length - 1, 0)));
  }, [entries.length]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (shouldIgnoreEnter(event)) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(entries.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? Math.max(entries.length - 1, 0) : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      entries[activeIndex]?.run();
    }
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="命令面板" size="sm">
      <Input
        label="搜索命令"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入命令名称"
        role="combobox"
        aria-expanded={open}
        aria-controls="command-palette-list"
        aria-activedescendant={
          entries[activeIndex] ? `command-${entries[activeIndex].id}` : undefined
        }
        autoFocus
      />
      <div id="command-palette-list" className="command-list" role="listbox">
        {taskResults.length > 0 ? (
          <>
            <p className="command-section">任务</p>
            {taskEntries.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                id={`command-${entry.id}`}
                className={
                  activeIndex === index ? "command-item command-item--active" : "command-item"
                }
                onMouseEnter={() => setActiveIndex(index)}
                onClick={entry.run}
              >
                {entry.icon}
                <span className="command-item__title">{entry.label}</span>
              </button>
            ))}
          </>
        ) : null}
        <p className="command-section">命令</p>
        {filtered.map((item, commandIndex) => {
          const index = taskEntries.length + commandIndex;
          return (
            <button
              key={item.label}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              id={`command-${item.label}`}
              className={
                activeIndex === index ? "command-item command-item--active" : "command-item"
              }
              onMouseEnter={() => setActiveIndex(index)}
              onClick={item.run}
            >
              {item.icon}
              {item.label}
              <span className="command-item__hint">{item.hint}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
