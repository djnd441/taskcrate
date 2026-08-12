import { RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task } from "@task-manager/domain";
import { Button, Checkbox, EmptyState, Skeleton, useToast } from "@task-manager/ui";
import { getAdapters } from "../adapters";
import { useTasksStore } from "../stores";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TrashView() {
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toast = useToast();
  const refreshTasks = useTasksStore((s) => s.refreshTasks);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getAdapters().tasks.list(
        { includeDeleted: true },
        { field: "createdAt", direction: "desc" },
        0,
        500,
      );
      const deleted = page.items.filter((task) => task.deletedAt);
      setItems(deleted);
      setSelectedIds((current) => current.filter((id) => deleted.some((task) => task.id === id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = useMemo(
    () => items.length > 0 && selectedIds.length === items.length,
    [items.length, selectedIds.length],
  );

  const restore = async (ids: string[]) => {
    try {
      const count = await getAdapters().batch.restore(ids);
      setSelectedIds([]);
      await load();
      await refreshTasks();
      toast.push({ type: "success", title: `已恢复 ${count} 项` });
    } catch (error) {
      toast.push({ type: "danger", title: "恢复失败", message: errorMessage(error) });
    }
  };

  const removeForever = async (ids: string[]) => {
    try {
      const count = await getAdapters().batch.hardDelete(ids);
      setSelectedIds([]);
      await load();
      await refreshTasks();
      toast.push({ type: "success", title: `已彻底删除 ${count} 项` });
    } catch (error) {
      toast.push({ type: "danger", title: "删除失败", message: errorMessage(error) });
    }
  };

  const clearAll = async () => {
    if (!window.confirm("确定清空回收站？任务将彻底删除且无法恢复。")) {
      return;
    }
    try {
      const count = await getAdapters().batch.clearTrash();
      await load();
      await refreshTasks();
      toast.push({ type: "success", title: `已清空 ${count} 项` });
    } catch (error) {
      toast.push({ type: "danger", title: "清空失败", message: errorMessage(error) });
    }
  };

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id],
    );
  };

  return (
    <section className="trash-view" aria-label="回收站视图">
      {!loading && items.length > 0 ? (
        <div className="trash-toolbar">
          <Checkbox
            label="全选"
            checked={allSelected}
            onChange={() =>
              allSelected ? setSelectedIds([]) : setSelectedIds(items.map((task) => task.id))
            }
          />
          <span className="trash-toolbar__count">已选 {selectedIds.length} 项</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={selectedIds.length === 0}
            onClick={() => void restore(selectedIds)}
          >
            <RotateCcw size={14} />
            恢复选中
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={selectedIds.length === 0}
            onClick={() => void removeForever(selectedIds)}
          >
            <Trash2 size={14} />
            删除选中
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void clearAll()}>
            清空回收站
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="task-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="task-skeleton" />
          ))}
        </div>
      ) : null}
      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<Trash2 size={22} />}
          title="回收站是空的"
          description="删除的任务会先进入这里，可恢复或彻底删除。"
        />
      ) : null}
      {!loading && items.length > 0 ? (
        <ul className="trash-list">
          {items.map((task) => (
            <li key={task.id} className="trash-row">
              <Checkbox
                aria-label={`选择 ${task.title}`}
                checked={selectedIds.includes(task.id)}
                onChange={() => toggle(task.id)}
              />
              <div className="trash-row__main">
                <span className="trash-row__title">{task.title}</span>
                <span className="trash-row__time">
                  {task.deletedAt
                    ? `删除于 ${new Date(task.deletedAt).toLocaleString("zh-CN")}`
                    : ""}
                </span>
              </div>
              <div className="trash-row__actions">
                <Button variant="secondary" size="sm" onClick={() => void restore([task.id])}>
                  <RotateCcw size={14} />
                  恢复
                </Button>
                <Button variant="danger" size="sm" onClick={() => void removeForever([task.id])}>
                  <Trash2 size={14} />
                  彻底删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
