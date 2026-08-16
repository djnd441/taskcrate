import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  FilterX,
  ListTodo,
  Package,
  Paperclip,
  Plus,
  Save,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  REPEAT_FREQUENCY_LABELS,
  type Task,
  type TaskFilter,
  type TaskKind,
  type TaskPriority,
  type TaskSort,
  type TaskStatus,
} from "@task-manager/domain";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  useToast,
  type BadgeTone,
} from "@task-manager/ui";
import { shouldIgnoreEnter } from "../lib/ime";
import {
  buildTaskRows,
  isTaskOverdue,
  rootProjectIdOf,
  type TaskGroupBy,
  type TaskRow,
} from "../lib/taskViewModel";
import { useProjectsStore, useTagsStore, useTasksStore, useUiStore } from "../stores";
import { getAdapters } from "../adapters";
import { ShareModal } from "../components/ShareModal";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待办",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

const KIND_LABELS: Record<TaskKind, string> = {
  main: "主任务",
  major: "大任务",
  minor: "小任务",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "无",
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

const GROUP_OPTIONS = [
  { value: "none", label: "不分组" },
  { value: "status", label: "按状态" },
  { value: "project", label: "按项目" },
  { value: "due", label: "按截止时间" },
] as const;

const SORT_FIELD_OPTIONS = [
  { value: "createdAt", label: "创建时间" },
  { value: "updatedAt", label: "更新时间" },
  { value: "dueAt", label: "截止时间" },
  { value: "priority", label: "优先级" },
  { value: "sortOrder", label: "手动排序" },
] as const;

type TaskRowDensity = "comfortable" | "compact";

function statusTone(status: TaskStatus): BadgeTone {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "info";
    case "cancelled":
      return "neutral";
    default:
      return "primary";
  }
}

function priorityTone(priority: TaskPriority): BadgeTone {
  switch (priority) {
    case "urgent":
      return "danger";
    case "high":
      return "warning";
    case "medium":
      return "primary";
    default:
      return "neutral";
  }
}

function formatDue(dueAt: string | null): string {
  if (!dueAt) {
    return "";
  }
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    return dueAt;
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function projectNameOf(
  projects: ReturnType<typeof useProjectsStore.getState>["projects"],
  projectId: string | null,
): string {
  if (!projectId) {
    return "收件箱";
  }
  return projects.find((project) => project.id === projectId)?.name ?? "未分类";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TaskListView() {
  const tasks = useTasksStore((s) => s.tasks);
  const allTasks = useTasksStore((s) => s.allTasks);
  const total = useTasksStore((s) => s.total);
  const loading = useTasksStore((s) => s.loading);
  const error = useTasksStore((s) => s.error);
  const filter = useTasksStore((s) => s.filter);
  const setFilter = useTasksStore((s) => s.setFilter);
  const sort = useTasksStore((s) => s.sort);
  const setSort = useTasksStore((s) => s.setSort);
  const transitionStatus = useTasksStore((s) => s.transitionStatus);
  const archive = useTasksStore((s) => s.archive);
  const softDelete = useTasksStore((s) => s.softDelete);
  const selectedIds = useTasksStore((s) => s.selectedIds);
  const toggleSelect = useTasksStore((s) => s.toggleSelect);
  const selectVisible = useTasksStore((s) => s.selectVisible);
  const clearSelection = useTasksStore((s) => s.clearSelection);
  const batchComplete = useTasksStore((s) => s.batchComplete);
  const batchSoftDelete = useTasksStore((s) => s.batchSoftDelete);
  const batchSetPriority = useTasksStore((s) => s.batchSetPriority);
  const batchSetProject = useTasksStore((s) => s.batchSetProject);
  const batchAddTags = useTasksStore((s) => s.batchAddTags);
  const projects = useProjectsStore((s) => s.projects);
  const tags = useTagsStore((s) => s.tags);
  const openDetail = useUiStore((s) => s.openDetail);
  const openQuickCreate = useUiStore((s) => s.openQuickCreate);

  const searchFocusToken = useUiStore((s) => s.searchFocusToken);
  const savedViews = useUiStore((s) => s.savedViews);
  const saveFilterView = useUiStore((s) => s.saveFilterView);
  const deleteFilterView = useUiStore((s) => s.deleteFilterView);
  const toast = useToast();

  const [quickTitle, setQuickTitle] = useState("");
  const [searchDraft, setSearchDraft] = useState(filter.query ?? "");
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("none");
  const [viewName, setViewName] = useState("");
  const [shareTaskId, setShareTaskId] = useState<string | null>(null);
  const [expandedMainIds, setExpandedMainIds] = useState<Set<string>>(new Set());
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [batchPriority, setBatchPriority] = useState("");
  const [batchProject, setBatchProject] = useState("");
  const [batchTag, setBatchTag] = useState("");
  const [rowDensity, setRowDensity] = useState<TaskRowDensity>("comfortable");
  const [now, setNow] = useState(() => Date.now());
  const quickInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const applyFilter = (next: TaskFilter) => {
    setFilter(next);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (searchFocusToken > 0) {
      searchRef.current?.focus();
    }
  }, [searchFocusToken]);

  useEffect(() => {
    setSearchDraft(filter.query ?? "");
  }, [filter.query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilter({
        ...filterRef.current,
        query: searchDraft.trim() || undefined,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft, setFilter]);

  const hasSearch = searchDraft.trim().length > 0;
  const rows = useMemo<TaskRow[]>(
    () =>
      buildTaskRows(tasks, projects, groupBy, (id) => (hasSearch ? true : expandedMainIds.has(id))),
    [expandedMainIds, groupBy, hasSearch, projects, tasks],
  );
  const shareTask = shareTaskId ? (tasks.find((task) => task.id === shareTaskId) ?? null) : null;
  const mainTaskIds = useMemo(
    () => tasks.filter((task) => task.taskKind === "main" || !task.parentId).map((task) => task.id),
    [tasks],
  );

  const boxAttachmentIds = useMemo(() => {
    const byMain = new Map<string, string[]>();
    const ids = new Set<string>();
    for (const mainId of mainTaskIds) {
      const queue = [mainId];
      const list: string[] = [];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }
        list.push(current);
        ids.add(current);
        for (const child of allTasks.filter((task) => task.parentId === current)) {
          queue.push(child.id);
        }
      }
      byMain.set(mainId, list);
    }
    return { byMain, ids: [...ids] };
  }, [allTasks, mainTaskIds]);

  useEffect(() => {
    if (boxAttachmentIds.ids.length === 0) {
      setAttachmentCounts({});
      return;
    }
    void getAdapters()
      .attachments.counts(boxAttachmentIds.ids)
      .then((raw) => {
        const next: Record<string, number> = {};
        for (const [mainId, list] of boxAttachmentIds.byMain) {
          next[mainId] = list.reduce((sum, id) => sum + (raw[id] ?? 0), 0);
        }
        setAttachmentCounts(next);
      })
      .catch(() => setAttachmentCounts({}));
  }, [boxAttachmentIds]);

  const mainProgress = useMemo(() => {
    const progress = new Map<string, number>();
    const childrenByParent = new Map<string, Task[]>();
    for (const task of allTasks) {
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
    for (const main of allTasks) {
      if (main.taskKind !== "main") {
        continue;
      }
      const summary = summarize(main.id);
      if (summary.total > 0) {
        progress.set(main.id, summary.completed / summary.total);
      }
    }
    return progress;
  }, [tasks]);

  const toggleMainExpanded = (id: string) => {
    setExpandedMainIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const quickFilters = useMemo(() => {
    const importantId = tags.find((tag) => tag.name === "重要")?.id;
    const urgentId = tags.find((tag) => tag.name === "紧急")?.id;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todayEnd = new Date(start);
    todayEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(start);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);
    return [
      {
        id: "today",
        label: "今天到期",
        filter: { dueFrom: start.toISOString(), dueUntil: todayEnd.toISOString() },
      },
      {
        id: "week",
        label: "7天内到期",
        filter: { dueFrom: start.toISOString(), dueUntil: weekEnd.toISOString() },
      },
      ...(importantId
        ? [{ id: "important", label: "重要", filter: { tagIds: [importantId] } }]
        : []),
      ...(urgentId ? [{ id: "urgent", label: "紧急", filter: { tagIds: [urgentId] } }] : []),
      { id: "completed", label: "已完成", filter: { statuses: ["completed" as const] } },
      { id: "in_progress", label: "进行中", filter: { statuses: ["in_progress" as const] } },
    ];
  }, [tags]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) =>
      rows[index].kind === "group" ? 32 : rowDensity === "compact" ? 46 : 54,
    overscan: 10,
  });

  const overdueTasks = useMemo(
    () =>
      tasks
        .filter((task) => isTaskOverdue(task, now))
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
    [now, tasks],
  );

  const allVisibleSelected = tasks.length > 0 && selectedIds.length === tasks.length;

  const handleQuickCreate = async () => {
    const title = quickTitle.trim();
    if (!title) {
      return;
    }
    setQuickTitle("");
    openQuickCreate(title);
    window.requestAnimationFrame(() => quickInputRef.current?.focus());
  };

  const handleStatusChange = (value: string) => {
    applyFilter({
      ...filter,
      statuses: value ? [value as TaskStatus] : undefined,
    });
  };

  const handlePriorityChange = (value: string) => {
    applyFilter({
      ...filter,
      priorities: value ? [value as TaskPriority] : undefined,
    });
  };

  const handleProjectChange = (value: string) => {
    applyFilter({ ...filter, projectId: value || undefined });
  };

  const handleTagChange = (value: string) => {
    applyFilter({ ...filter, tagIds: value ? [value] : undefined });
  };

  const handleDueFromChange = (value: string) => {
    applyFilter({
      ...filter,
      dueFrom: value ? new Date(`${value}T00:00:00`).toISOString() : undefined,
    });
  };

  const handleDueUntilChange = (value: string) => {
    applyFilter({
      ...filter,
      dueUntil: value ? new Date(`${value}T23:59:59`).toISOString() : undefined,
    });
  };

  const resetFilters = () => {
    applyFilter({});
    setSearchDraft("");
  };

  const handleImportShare = async () => {
    try {
      const result = await getAdapters().share.importFile();
      await useTasksStore.getState().refreshTasks();
      toast.push({ type: "success", title: "任务已导入", message: `导入 ${result.tasks} 个任务` });
    } catch (importError) {
      toast.push({ type: "danger", title: "导入失败", message: errorMessage(importError) });
    }
  };

  const handleSaveView = () => {
    const name = viewName.trim();
    if (!name) {
      toast.push({ type: "warning", title: "请输入筛选视图名称" });
      return;
    }
    saveFilterView(name, filter, sort);
    setViewName("");
    toast.push({ type: "success", title: "筛选视图已保存" });
  };

  const applySavedView = (view: (typeof savedViews)[number]) => {
    applyFilter(view.filter);
    setSort(view.sort);
    setGroupBy("none");
    setSearchDraft(view.filter.query ?? "");
    toast.push({ type: "info", title: `已应用 ${view.name}` });
  };

  const runBatch = async (action: () => Promise<number>) => {
    if (selectedIds.length === 0) {
      return;
    }
    try {
      const count = await action();
      toast.push({ type: "success", title: `已处理 ${count} 项` });
    } catch (batchError) {
      toast.push({ type: "danger", title: "批量操作失败", message: errorMessage(batchError) });
    }
  };

  const handleBatchPriority = (value: string) => {
    setBatchPriority(value);
    if (!value) {
      return;
    }
    void runBatch(() => batchSetPriority(selectedIds, value as TaskPriority)).then(() => {
      setBatchPriority("");
    });
  };

  const handleBatchProject = (value: string) => {
    setBatchProject(value);
    if (!value) {
      return;
    }
    void runBatch(() => batchSetProject(selectedIds, value || null)).then(() => {
      setBatchProject("");
    });
  };

  const handleBatchTag = (value: string) => {
    setBatchTag(value);
    if (!value) {
      return;
    }
    void runBatch(() => batchAddTags(selectedIds, [value])).then(() => {
      setBatchTag("");
    });
  };

  return (
    <section className={`task-view task-view--density-${rowDensity}`} aria-label="任务列表视图">
      <div className="quick-create-bar">
        <Input
          ref={quickInputRef}
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !shouldIgnoreEnter(event)) {
              event.preventDefault();
              void handleQuickCreate();
            }
          }}
          placeholder="输入主任务标题，回车开始拆解"
          aria-label="快速新建任务"
        />
        <Button onClick={() => void handleQuickCreate()}>
          <Plus size={15} />
          新建
        </Button>
      </div>

      <div className="quick-filters" role="group" aria-label="快捷筛选">
        {quickFilters.map((preset) => {
          const active = JSON.stringify(filter) === JSON.stringify(preset.filter);
          return (
            <button
              key={preset.id}
              type="button"
              className={active ? "quick-filter quick-filter--active" : "quick-filter"}
              aria-pressed={active}
              onClick={() => {
                if (active) {
                  applyFilter({});
                  setSearchDraft("");
                } else {
                  applyFilter(preset.filter);
                  setSearchDraft("");
                }
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {overdueTasks.length > 0 ? (
        <div className="overdue-banner" role="status">
          <div>
            <strong>{overdueTasks.length} 项任务已逾期</strong>
            <span>
              {overdueTasks
                .slice(0, 3)
                .map((task) => task.title)
                .join("、")}
            </span>
          </div>
        </div>
      ) : null}

      <div className="task-toolbar task-toolbar--filters">
        <Input
          ref={searchRef}
          label="搜索"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="标题或备注"
        />
        <Select
          label="状态"
          value={filter.statuses?.[0] ?? ""}
          onChange={(event) => handleStatusChange(event.target.value)}
          placeholder="全部状态"
          options={(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => ({
            value: status,
            label: STATUS_LABELS[status],
          }))}
        />
        <Select
          label="优先级"
          value={filter.priorities?.[0] ?? ""}
          onChange={(event) => handlePriorityChange(event.target.value)}
          placeholder="全部优先级"
          options={(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => ({
            value: priority,
            label: PRIORITY_LABELS[priority],
          }))}
        />
        <Select
          label="项目"
          value={filter.projectId ?? ""}
          onChange={(event) => handleProjectChange(event.target.value)}
          placeholder="全部项目"
          options={projects.map((project) => ({ value: project.id, label: project.name }))}
        />
        <Select
          label="标签"
          value={filter.tagIds?.[0] ?? ""}
          onChange={(event) => handleTagChange(event.target.value)}
          placeholder="全部标签"
          options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
        />
        <Input
          label="截止从"
          type="date"
          value={filter.dueFrom?.slice(0, 10) ?? ""}
          onChange={(event) => handleDueFromChange(event.target.value)}
        />
        <Input
          label="截止到"
          type="date"
          value={filter.dueUntil?.slice(0, 10) ?? ""}
          onChange={(event) => handleDueUntilChange(event.target.value)}
        />
        <div className="toolbar-actions">
          <Button variant="secondary" onClick={resetFilters}>
            <FilterX size={14} />
            重置
          </Button>
        </div>
      </div>

      <div className="task-toolbar task-toolbar--layout">
        <Select
          label="分组"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as TaskGroupBy)}
          options={GROUP_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <Select
          label="排序字段"
          value={sort.field}
          onChange={(event) => setSort({ ...sort, field: event.target.value as TaskSort["field"] })}
          options={SORT_FIELD_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        <Select
          label="排序方向"
          value={sort.direction}
          onChange={(event) =>
            setSort({ ...sort, direction: event.target.value as TaskSort["direction"] })
          }
          options={[
            { value: "asc", label: "升序" },
            { value: "desc", label: "降序" },
          ]}
        />
        <Select
          label="行密度"
          value={rowDensity}
          onChange={(event) => setRowDensity(event.target.value as TaskRowDensity)}
          options={[
            { value: "comfortable", label: "舒适" },
            { value: "compact", label: "紧凑" },
          ]}
        />
        <Button variant="secondary" onClick={() => void handleImportShare()}>
          <Upload size={14} />
          导入任务
        </Button>
        <div className="view-save">
          <Input
            label="保存筛选"
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            placeholder="视图名称"
          />
          <Button variant="secondary" onClick={handleSaveView}>
            <Save size={14} />
            保存
          </Button>
        </div>
      </div>

      {savedViews.length > 0 ? (
        <div className="saved-views" aria-label="已保存筛选">
          {savedViews.map((view) => (
            <div key={view.id} className="saved-view">
              <button type="button" onClick={() => applySavedView(view)}>
                {view.name}
              </button>
              <IconButton
                size="sm"
                label={`删除筛选 ${view.name}`}
                onClick={() => deleteFilterView(view.id)}
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))}
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="batch-bar" aria-label="批量操作">
          <span className="batch-bar__count">已选 {selectedIds.length} 项</span>
          <Button size="sm" onClick={() => void runBatch(() => batchComplete(selectedIds))}>
            完成
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (window.confirm(`确定删除选中的 ${selectedIds.length} 项任务？`)) {
                void runBatch(() => batchSoftDelete(selectedIds));
              }
            }}
          >
            删除
          </Button>
          <Select
            value={batchPriority}
            onChange={(event) => handleBatchPriority(event.target.value)}
            placeholder="改优先级"
            options={(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => ({
              value: priority,
              label: PRIORITY_LABELS[priority],
            }))}
          />
          <Select
            value={batchProject}
            onChange={(event) => handleBatchProject(event.target.value)}
            placeholder="移动项目"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
          />
          <Select
            value={batchTag}
            onChange={(event) => handleBatchTag(event.target.value)}
            placeholder="添加标签"
            options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
          />
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            取消选择
          </Button>
        </div>
      ) : null}

      {error ? <p className="view-error">{error}</p> : null}

      {loading ? (
        <div className="task-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="task-skeleton" />
          ))}
        </div>
      ) : null}

      {!loading && tasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo size={22} />}
          title="暂无匹配任务"
          description="在上方输入标题并回车快速创建，或调整筛选条件。"
        />
      ) : null}

      {!loading && tasks.length > 0 ? (
        <>
          <div className="list-header-row">
            <Checkbox
              aria-label="选择全部可见任务"
              checked={allVisibleSelected}
              onChange={() => (allVisibleSelected ? clearSelection() : selectVisible())}
            />
            <p className="view-summary">
              共 {total} 项任务，已显示 {tasks.length} 项
            </p>
          </div>
          <div ref={listRef} className="virtual-task-list">
            <div
              className="virtual-task-list__inner"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) {
                  return null;
                }
                return (
                  <div
                    key={virtualRow.key}
                    className="virtual-row"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.kind === "group" ? (
                      <div className="task-group-header">
                        <span>{row.label}</span>
                        <Badge tone="neutral">{row.count}</Badge>
                      </div>
                    ) : (
                      <TaskRow
                        task={row.task}
                        depth={row.kind === "main" ? 0 : row.depth}
                        isContainer={row.kind === "main"}
                        expanded={row.kind === "main" ? row.expanded : undefined}
                        childCount={row.kind === "main" ? row.childCount : undefined}
                        attachmentCount={
                          row.kind === "main" ? (attachmentCounts[row.task.id] ?? 0) : undefined
                        }
                        progress={row.kind === "main" ? mainProgress.get(row.task.id) : undefined}
                        onToggleExpand={
                          row.kind === "main" ? () => toggleMainExpanded(row.task.id) : undefined
                        }
                        projectName={projectNameOf(projects, rootProjectIdOf(row.task, tasks))}
                        selected={selectedIds.includes(row.task.id)}
                        overdue={isTaskOverdue(row.task, now)}
                        onOpen={() => openDetail(row.task.id)}
                        onToggle={() =>
                          void transitionStatus(
                            row.task.id,
                            row.task.status === "completed" ? "todo" : "completed",
                          ).catch(() => undefined)
                        }
                        onToggleSelect={() => toggleSelect(row.task.id)}
                        onShare={() => setShareTaskId(row.task.id)}
                        onArchive={() => {
                          if (window.confirm(`归档 ${row.task.title}？`)) {
                            void archive(row.task.id).catch(() => undefined);
                          }
                        }}
                        onDelete={() => {
                          if (window.confirm(`删除 ${row.task.title}？子任务会一起进入回收站。`)) {
                            void softDelete(row.task.id).catch(() => undefined);
                          }
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {shareTask ? <ShareModal open task={shareTask} onClose={() => setShareTaskId(null)} /> : null}
    </section>
  );
}

interface TaskRowProps {
  task: Task;
  projectName: string;
  selected: boolean;
  overdue: boolean;
  depth?: number;
  isContainer?: boolean;
  expanded?: boolean;
  childCount?: number;
  attachmentCount?: number;
  progress?: number;
  onToggleExpand?: () => void;
  onOpen: () => void;
  onToggle: () => void;
  onToggleSelect: () => void;
  onShare: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function TaskRow({
  task,
  projectName,
  selected,
  overdue,
  depth = 0,
  isContainer = false,
  expanded = false,
  childCount = 0,
  attachmentCount = 0,
  progress,
  onToggleExpand,
  onOpen,
  onToggle,
  onToggleSelect,
  onShare,
  onArchive,
  onDelete,
}: TaskRowProps) {
  const dueText = formatDue(task.dueAt);
  return (
    <div
      className={[
        "task-row",
        selected ? "task-row--selected" : "",
        overdue ? "task-row--overdue" : "",
        task.taskKind === "minor" ? "task-row--minor" : "",
        task.taskKind === "major" ? "task-row--major" : "",
        `task-row--depth-${depth}`,
        isContainer ? "task-row--container" : "",
        expanded ? "task-row--expanded" : "",
        `task-row--priority-${task.priority}`,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onOpen}
    >
      <Checkbox
        label=""
        aria-label={`选择 ${task.title}`}
        checked={selected}
        onChange={onToggleSelect}
        onClick={(event) => event.stopPropagation()}
      />
      <Checkbox
        label=""
        aria-label={`完成 ${task.title}`}
        checked={task.status === "completed"}
        onChange={onToggle}
        onClick={(event) => event.stopPropagation()}
      />
      <div className="task-row__main">
        <div className="task-row__title-line">
          {isContainer ? (
            <IconButton
              size="sm"
              label={expanded ? `收起 ${task.title}` : `展开 ${task.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpand?.();
              }}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </IconButton>
          ) : null}
          <Badge
            tone={
              task.taskKind === "major" ? "info" : task.taskKind === "minor" ? "primary" : "neutral"
            }
          >
            {KIND_LABELS[task.taskKind]}
          </Badge>
          <span
            className={
              task.status === "completed"
                ? "task-row__title task-row__title--done"
                : "task-row__title"
            }
          >
            {task.title}
          </span>
        </div>
        <div className="task-row__meta">
          <span>{projectName}</span>
          {isContainer && childCount > 0 ? <span>{childCount} 个子任务</span> : null}
          {isContainer && attachmentCount > 0 ? (
            <span>
              <Paperclip size={12} />
              {attachmentCount} 个附件
            </span>
          ) : null}
          {task.resources.length > 0 ? (
            <span>
              <Package size={12} />
              {task.resources.length} 资源
            </span>
          ) : null}
          {dueText ? (
            <span>
              <Clock size={12} />
              截止 {dueText}
            </span>
          ) : null}
        </div>
        {isContainer && progress !== undefined ? (
          <div
            className="task-row__progress"
            aria-label={`子任务完成 ${Math.round(progress * 100)}%`}
          >
            <span className="task-row__progress-track">
              <span
                className="task-row__progress-fill"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
            <span className="task-row__progress-value">{Math.round(progress * 100)}%</span>
          </div>
        ) : null}
      </div>
      <div className="task-row__badges">
        {task.repeatFrequency !== "none" ? (
          <Badge tone="info">
            {REPEAT_FREQUENCY_LABELS[task.repeatFrequency]}
            {task.repeatFrequency === "custom" && task.repeatInterval > 1
              ? ` ${task.repeatInterval}`
              : ""}
          </Badge>
        ) : null}
        <Badge tone={priorityTone(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
        <Badge tone={statusTone(task.status)}>{STATUS_LABELS[task.status]}</Badge>
      </div>
      <div className="task-row__actions" onClick={(event) => event.stopPropagation()}>
        <IconButton label={`分享 ${task.title}`} onClick={onShare}>
          <Share2 size={15} />
        </IconButton>
        <IconButton label={`归档 ${task.title}`} onClick={onArchive}>
          <Archive size={15} />
        </IconButton>
        <IconButton label={`删除 ${task.title}`} onClick={onDelete}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  );
}
