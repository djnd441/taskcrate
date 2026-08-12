import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronDown, Clock, Layers, MoreHorizontal, Package, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Project, Task, TaskStatus } from "@task-manager/domain";
import { Badge, Button, EmptyState, IconButton, Menu, Popover, useToast } from "@task-manager/ui";
import { isTaskOverdue, rootProjectIdOf } from "../lib/taskViewModel";
import { useProjectsStore, useTasksStore, useUiStore } from "../stores";

const STATUS_COLUMNS: { id: string; status: TaskStatus; label: string }[] = [
  { id: "status:todo", status: "todo", label: "待办" },
  { id: "status:in_progress", status: "in_progress", label: "进行中" },
  { id: "status:completed", status: "completed", label: "已完成" },
  { id: "status:cancelled", status: "cancelled", label: "已取消" },
];

const KIND_LABELS: Record<Task["taskKind"], string> = {
  main: "主任务",
  major: "大任务",
  minor: "小任务",
};

const PRIORITY_LABELS: Record<Task["priority"], string> = {
  none: "无",
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

type BoardMode = "status" | "project" | "main";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function descendantTasksOf(id: string, tasks: Task[]): Task[] {
  const children = tasks
    .filter((task) => task.parentId === id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return children.flatMap((child) => [child, ...descendantTasksOf(child.id, tasks)]);
}

function taskPath(task: Task, allTasks: Task[]): string {
  if (task.taskKind === "main") {
    return "";
  }
  const parent = task.parentId ? allTasks.find((item) => item.id === task.parentId) : undefined;
  const main =
    task.taskKind === "minor" && parent?.parentId
      ? allTasks.find((item) => item.id === parent.parentId)
      : parent?.taskKind === "main"
        ? parent
        : undefined;
  return [main?.title, parent && parent.id !== main?.id ? parent.title : null]
    .filter(Boolean)
    .join(" > ");
}

export function BoardView() {
  const tasks = useTasksStore((s) => s.allTasks);
  const transitionStatus = useTasksStore((s) => s.transitionStatus);
  const updateTask = useTasksStore((s) => s.updateTask);
  const projects = useProjectsStore((s) => s.projects);
  const toast = useToast();
  const [mode, setMode] = useState<BoardMode>("status");
  const [activeStatus, setActiveStatus] = useState<TaskStatus | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const visibleTasks = tasks.filter((task) => !task.archivedAt && !task.deletedAt);
  const mainTasks = visibleTasks.filter((task) => task.taskKind === "main" || !task.parentId);

  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of visibleTasks) {
      if (!task.parentId) {
        continue;
      }
      counts.set(task.parentId, (counts.get(task.parentId) ?? 0) + 1);
    }
    return counts;
  }, [visibleTasks]);

  const progressByTask = useMemo(() => {
    const progress = new Map<string, number>();
    const childrenByParent = new Map<string, Task[]>();
    for (const task of visibleTasks) {
      if (!task.parentId) {
        continue;
      }
      const siblings = childrenByParent.get(task.parentId);
      if (siblings) {
        siblings.push(task);
      } else {
        childrenByParent.set(task.parentId, [task]);
      }
    }
    const summarize = (id: string): { total: number; completed: number } => {
      let total = 0;
      let completed = 0;
      for (const child of childrenByParent.get(id) ?? []) {
        total += 1;
        if (child.status === "completed") {
          completed += 1;
        }
        const nested = summarize(child.id);
        total += nested.total;
        completed += nested.completed;
      }
      return { total, completed };
    };
    for (const task of visibleTasks) {
      if (task.taskKind !== "main") {
        continue;
      }
      const summary = summarize(task.id);
      if (summary.total > 0) {
        progress.set(task.id, summary.completed / summary.total);
      }
    }
    return progress;
  }, [visibleTasks]);

  const overdueIds = useMemo(() => {
    const now = Date.now();
    return new Set(visibleTasks.filter((task) => isTaskOverdue(task, now)).map((task) => task.id));
  }, [visibleTasks]);

  const overdueCounts: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const task of visibleTasks) {
    if (overdueIds.has(task.id)) {
      overdueCounts[task.status] += 1;
    }
  }

  const columns =
    mode === "project"
      ? [
          ...projects.map((project) => ({
            id: `project:${project.id}`,
            title: project.name,
            tasks: visibleTasks.filter(
              (task) => rootProjectIdOf(task, visibleTasks) === project.id,
            ),
          })),
          {
            id: "project:__inbox",
            title: "收件箱",
            tasks: visibleTasks.filter((task) => !rootProjectIdOf(task, visibleTasks)),
          },
        ]
      : mode === "main"
        ? mainTasks.map((main) => ({
            id: `main:${main.id}`,
            title: main.title,
            tasks: descendantTasksOf(main.id, visibleTasks),
            mainTask: main,
          }))
        : [];

  const handleDragEnd = async (event: DragEndEvent) => {
    const taskId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveTask(null);
    if (!overId) {
      return;
    }
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    try {
      if (mode === "status") {
        const target = overId.replace("status:", "");
        await transitionStatus(task.id, target as TaskStatus);
        toast.push({ type: "success", title: "状态已更新" });
      } else if (mode === "project") {
        const projectId = overId === "project:__inbox" ? null : overId.replace("project:", "");
        await updateTask(task.id, { projectId });
        toast.push({ type: "success", title: "项目已更新" });
      }
    } catch (dragError) {
      toast.push({ type: "danger", title: "移动失败", message: errorMessage(dragError) });
    }
  };

  const handleMove = async (task: Task, target: string) => {
    if (mode === "status") {
      try {
        await transitionStatus(task.id, target as TaskStatus);
        toast.push({ type: "success", title: "状态已更新" });
      } catch (moveError) {
        toast.push({ type: "danger", title: "移动失败", message: errorMessage(moveError) });
      }
    } else if (mode === "project") {
      try {
        const projectId = target === "__inbox" ? null : target;
        await updateTask(task.id, { projectId });
        toast.push({ type: "success", title: "项目已更新" });
      } catch (moveError) {
        toast.push({ type: "danger", title: "移动失败", message: errorMessage(moveError) });
      }
    }
  };

  return (
    <section className="board-view" aria-label="看板视图">
      <div className="board-toolbar">
        <div className="board-mode" role="group" aria-label="看板分列方式">
          <button
            type="button"
            className={
              mode === "status" ? "board-mode__item board-mode__item--active" : "board-mode__item"
            }
            onClick={() => setMode("status")}
          >
            按状态
          </button>
          <button
            type="button"
            className={
              mode === "project" ? "board-mode__item board-mode__item--active" : "board-mode__item"
            }
            onClick={() => setMode("project")}
          >
            按项目
          </button>
          <button
            type="button"
            className={
              mode === "main" ? "board-mode__item board-mode__item--active" : "board-mode__item"
            }
            onClick={() => setMode("main")}
          >
            按主任务
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(event) =>
          setActiveTask(tasks.find((task) => task.id === String(event.active.id)) ?? null)
        }
        onDragEnd={(event) => void handleDragEnd(event)}
        onDragCancel={() => setActiveTask(null)}
      >
        {mode === "status" ? (
          <div className="board-status-shell">
            <BoardPanelStrip
              tasks={visibleTasks}
              activeStatus={activeStatus}
              overdueCounts={overdueCounts}
              overdueIds={overdueIds}
              onSelect={setActiveStatus}
            />
            {activeStatus ? (
              <BoardDetailPanel
                status={activeStatus}
                tasks={visibleTasks.filter((task) => task.status === activeStatus)}
                allTasks={visibleTasks}
                childCounts={childCounts}
                progressByTask={progressByTask}
                overdueIds={overdueIds}
                onOpen={(id) => useUiStore.getState().openDetail(id)}
                onMove={handleMove}
                onCollapse={() => setActiveStatus(null)}
              />
            ) : null}
          </div>
        ) : (
          <div className="board-columns">
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                id={column.id}
                title={column.title}
                tasks={column.tasks}
                mode={mode}
                projects={projects}
                allTasks={visibleTasks}
                childCounts={childCounts}
                progressByTask={progressByTask}
                overdueIds={overdueIds}
                mainTask={
                  "mainTask" in column ? (column as { mainTask?: Task }).mainTask : undefined
                }
                onMove={handleMove}
              />
            ))}
          </div>
        )}
        <DragOverlay>
          {activeTask ? (
            <div
              className={[
                "board-task-card",
                "board-task-card--dragging",
                `board-task-card--priority-${activeTask.priority}`,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="board-task-card__title">{activeTask.title}</span>
              <span className="board-task-card__meta">
                <span>{PRIORITY_LABELS[activeTask.priority]}</span>
                {activeTask.dueAt ? (
                  <span>截止 {new Date(activeTask.dueAt).toLocaleDateString("zh-CN")}</span>
                ) : null}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function BoardPanelStrip({
  tasks,
  activeStatus,
  overdueCounts,
  overdueIds,
  onSelect,
}: {
  tasks: Task[];
  activeStatus: TaskStatus | null;
  overdueCounts: Record<TaskStatus, number>;
  overdueIds: Set<string>;
  onSelect: (status: TaskStatus) => void;
}) {
  return (
    <div className="board-panel-strip" role="tablist" aria-label="状态面板">
      {STATUS_COLUMNS.map((column) => {
        const panelTasks = tasks.filter((task) => task.status === column.status);
        const { setNodeRef, isOver } = useDroppable({ id: `status:${column.status}` });
        const active = activeStatus === column.status;
        return (
          <button
            key={column.status}
            ref={setNodeRef}
            type="button"
            role="tab"
            aria-selected={active}
            aria-expanded={active}
            className={[
              "board-panel-strip__panel",
              `board-panel-strip__panel--${column.status}`,
              active ? "board-panel-strip__panel--active" : "",
              isOver ? "board-panel-strip__panel--over" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(column.status)}
          >
            <span className="board-panel-strip__head">
              <span className="board-panel-strip__title">{column.label}</span>
              <span className="board-panel-strip__count">
                <Badge tone={active ? "primary" : "neutral"}>{panelTasks.length}</Badge>
                {overdueCounts[column.status] > 0 ? (
                  <Badge tone="danger">{overdueCounts[column.status]} 逾期</Badge>
                ) : null}
              </span>
            </span>
            <span className="board-panel-strip__thumbs">
              {panelTasks.slice(0, 3).map((task) => (
                <span
                  key={task.id}
                  className={[
                    "board-panel-strip__thumb",
                    `board-panel-strip__thumb--priority-${task.priority}`,
                    overdueIds.has(task.id) ? "board-panel-strip__thumb--overdue" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {task.title}
                </span>
              ))}
              {panelTasks.length > 3 ? (
                <span className="board-panel-strip__more">+{panelTasks.length - 3}</span>
              ) : null}
              {panelTasks.length === 0 ? (
                <span className="board-panel-strip__empty">暂无任务</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BoardDetailPanel({
  status,
  tasks,
  allTasks,
  childCounts,
  progressByTask,
  overdueIds,
  onOpen,
  onMove,
  onCollapse,
}: {
  status: TaskStatus;
  tasks: Task[];
  allTasks: Task[];
  childCounts: Map<string, number>;
  progressByTask: Map<string, number>;
  overdueIds: Set<string>;
  onOpen: (id: string) => void;
  onMove: (task: Task, target: string) => void;
  onCollapse: () => void;
}) {
  const column = STATUS_COLUMNS.find((item) => item.status === status);
  const overdueCount = tasks.filter((task) => overdueIds.has(task.id)).length;
  return (
    <section
      className={`board-detail-panel board-detail-panel--${status}`}
      aria-label={`${column?.label ?? status}详情`}
    >
      <header className="board-detail-panel__header">
        <div className="board-detail-panel__heading">
          <span
            className={`board-detail-panel__status-dot board-detail-panel__status-dot--${status}`}
          />
          <div>
            <h2>{column?.label ?? status}</h2>
            <p>
              {tasks.length} 项任务
              {overdueCount > 0 ? ` · ${overdueCount} 项逾期` : ""}
            </p>
          </div>
        </div>
        <div className="board-detail-panel__actions">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => useUiStore.getState().openQuickCreate()}
          >
            <Plus size={14} />
            新增任务
          </Button>
          <Button size="sm" variant="secondary" onClick={onCollapse}>
            <ChevronDown size={14} />
            收起
          </Button>
        </div>
      </header>
      <div className="board-detail-panel__body">
        {tasks.length === 0 ? (
          <EmptyState title="暂无任务" description="将任务拖入上方对应面板，或直接创建任务" />
        ) : (
          tasks.map((task) => (
            <BoardTaskCard
              key={task.id}
              task={task}
              allTasks={allTasks}
              childCount={childCounts.get(task.id) ?? 0}
              progress={progressByTask.get(task.id)}
              overdue={overdueIds.has(task.id)}
              onOpen={() => onOpen(task.id)}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </section>
  );
}

function BoardTaskCard({
  task,
  allTasks,
  childCount,
  progress,
  overdue,
  onOpen,
  onMove,
}: {
  task: Task;
  allTasks: Task[];
  childCount: number;
  progress?: number;
  overdue: boolean;
  onOpen: () => void;
  onMove: (task: Task, target: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const menuItems = STATUS_COLUMNS.filter((column) => column.status !== task.status).map(
    (column) => ({
      label: `移动到 ${column.label}`,
      onSelect: () => onMove(task, column.status),
    }),
  );
  const path = taskPath(task, allTasks);
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={[
        "board-task-card",
        `board-task-card--priority-${task.priority}`,
        task.taskKind === "minor" ? "board-task-card--minor" : "",
        overdue ? "board-task-card--overdue" : "",
        isDragging ? "board-task-card--source" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onOpen}
    >
      <span className="board-task-card__stripe" aria-hidden="true" />
      {path ? <span className="board-task-card__path">{path}</span> : null}
      <div className="board-task-card__title-line">
        <Badge
          tone={
            task.taskKind === "major" ? "info" : task.taskKind === "minor" ? "primary" : "neutral"
          }
        >
          {KIND_LABELS[task.taskKind]}
        </Badge>
        <span className="board-task-card__title">{task.title}</span>
      </div>
      <div className="board-task-card__meta">
        <span className={`board-task-card__priority board-task-card__priority--${task.priority}`}>
          <span className="board-task-card__priority-dot" />
          {PRIORITY_LABELS[task.priority]}
        </span>
        {task.dueAt ? (
          <span className={overdue ? "board-task-card__due--overdue" : ""}>
            <Clock size={12} />
            截止 {new Date(task.dueAt).toLocaleDateString("zh-CN")}
          </span>
        ) : null}
        {task.resources.length > 0 ? (
          <span>
            <Package size={12} />
            {task.resources.length} 资源
          </span>
        ) : null}
      </div>
      {childCount > 0 ? (
        <div className="board-task-card__children">
          <Layers size={12} />
          <span>{childCount} 个子任务</span>
          {progress !== undefined ? (
            <span className="board-task-card__progress">
              <span className="board-task-card__progress-track">
                <span
                  className="board-task-card__progress-fill"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </span>
              <span className="board-task-card__progress-value">{Math.round(progress * 100)}%</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="board-task-card__actions" onClick={(event) => event.stopPropagation()}>
        <Popover
          align="end"
          trigger={
            <IconButton size="sm" label={`移动 ${task.title}`}>
              <MoreHorizontal size={14} />
            </IconButton>
          }
        >
          <Menu items={menuItems} />
        </Popover>
      </div>
    </article>
  );
}

function BoardColumn({
  id,
  title,
  tasks,
  mode,
  projects,
  allTasks,
  childCounts,
  progressByTask,
  overdueIds,
  mainTask,
  onMove,
}: {
  id: string;
  title: string;
  tasks: Task[];
  mode: Exclude<BoardMode, "status">;
  projects: Project[];
  allTasks: Task[];
  childCounts: Map<string, number>;
  progressByTask: Map<string, number>;
  overdueIds: Set<string>;
  mainTask?: Task;
  onMove: (task: Task, target: string) => void;
}) {
  const openDetail = useUiStore((s) => s.openDetail);
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={[
        "board-column",
        mode === "main" ? "board-column--main" : "",
        mainTask ? `board-column--priority-${mainTask.priority}` : "",
        isOver ? "board-column--over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="board-column__header">
        <h2>{title}</h2>
        <Badge tone="neutral">{tasks.length}</Badge>
      </header>
      {mainTask ? (
        <p className="board-column__main-meta">
          <Badge tone="neutral">主任务</Badge>
          <span>{KIND_LABELS[mainTask.taskKind]}</span>
        </p>
      ) : null}
      <div className="board-column__body">
        {tasks.length === 0 ? (
          <EmptyState title="暂无任务" />
        ) : (
          tasks.map((task) => (
            <BoardCard
              key={task.id}
              task={task}
              onOpen={() => openDetail(task.id)}
              mode={mode}
              projects={projects}
              allTasks={allTasks}
              childCount={childCounts.get(task.id) ?? 0}
              progress={progressByTask.get(task.id)}
              overdue={overdueIds.has(task.id)}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </div>
  );
}

function BoardCard({
  task,
  onOpen,
  mode,
  projects,
  allTasks,
  childCount,
  progress,
  overdue,
  onMove,
}: {
  task: Task;
  onOpen: () => void;
  mode: Exclude<BoardMode, "status">;
  projects: Project[];
  allTasks: Task[];
  childCount: number;
  progress?: number;
  overdue: boolean;
  onMove: (task: Task, target: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const menuItems =
    mode === "main"
      ? []
      : [
          ...projects.map((project) => ({
            label: `移动到 ${project.name}`,
            onSelect: () => onMove(task, project.id),
          })),
          {
            label: "移动到收件箱",
            onSelect: () => onMove(task, "__inbox"),
          },
        ];
  const path = taskPath(task, allTasks);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={[
        "board-card",
        isDragging ? "board-card--source" : "",
        task.taskKind === "minor" ? "board-card--minor" : "",
        `board-card--priority-${task.priority}`,
        overdue ? "board-card--overdue" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onOpen}
    >
      {path ? <span className="board-card__path">{path}</span> : null}
      <div className="board-card__title-line">
        <Badge
          tone={
            task.taskKind === "major" ? "info" : task.taskKind === "minor" ? "primary" : "neutral"
          }
        >
          {KIND_LABELS[task.taskKind]}
        </Badge>
        <span className="board-card__title">{task.title}</span>
      </div>
      <div className="board-card__meta">
        <span className={`board-card__priority board-card__priority--${task.priority}`}>
          <span className="board-card__priority-dot" />
          {PRIORITY_LABELS[task.priority]}
        </span>
        {task.dueAt ? (
          <span className={overdue ? "board-card__due--overdue" : ""}>
            <Clock size={12} />
            截止 {new Date(task.dueAt).toLocaleDateString("zh-CN")}
          </span>
        ) : null}
        {task.resources.length > 0 ? (
          <span>
            <Package size={12} />
            {task.resources.length} 工具/资源
          </span>
        ) : null}
        {childCount > 0 ? (
          <span>
            <Layers size={12} />
            {childCount} 子任务
          </span>
        ) : null}
      </div>
      {progress !== undefined ? (
        <div className="board-card__progress">
          <span className="board-card__progress-track">
            <span
              className="board-card__progress-fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
          <span className="board-card__progress-value">{Math.round(progress * 100)}%</span>
        </div>
      ) : null}
      {menuItems.length > 0 ? (
        <div className="board-card__actions" onClick={(event) => event.stopPropagation()}>
          <Popover
            align="end"
            trigger={
              <IconButton size="sm" label={`移动 ${task.title}`}>
                <MoreHorizontal size={14} />
              </IconButton>
            }
          >
            <Menu items={menuItems} />
          </Popover>
        </div>
      ) : null}
    </div>
  );
}
