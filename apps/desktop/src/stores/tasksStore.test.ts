import { beforeEach, describe, expect, it } from "vitest";
import { useTasksStore } from "./tasksStore";

describe("tasksStore", () => {
  beforeEach(() => {
    useTasksStore.setState({
      tasks: [],
      allTasks: [],
      total: 0,
      offset: 0,
      limit: 10000,
      loading: false,
      error: null,
      selectedIds: [],
      filter: {},
      sort: { field: "createdAt", direction: "asc" },
    });
  });

  it("creates a task and reloads the list", async () => {
    const created = await useTasksStore.getState().createTask({ title: "store 测试任务" });
    expect(created.title).toBe("store 测试任务");
    const state = useTasksStore.getState();
    expect(state.total).toBeGreaterThan(0);
    expect(state.tasks.some((task) => task.id === created.id)).toBe(true);
  });

  it("keeps full task list separate from filtered list", async () => {
    const created = await useTasksStore.getState().createTask({ title: "全量任务" });
    useTasksStore.setState({ filter: { statuses: ["cancelled"] } });
    await useTasksStore.getState().loadTasks();
    const state = useTasksStore.getState();
    expect(state.tasks).toEqual([]);
    expect(state.allTasks.some((task) => task.id === created.id)).toBe(true);
  });

  it("tracks and clears selection", () => {
    const store = useTasksStore.getState();
    store.toggleSelect("a");
    store.toggleSelect("b");
    expect(useTasksStore.getState().selectedIds).toEqual(["a", "b"]);
    useTasksStore.getState().toggleSelect("a");
    expect(useTasksStore.getState().selectedIds).toEqual(["b"]);
    useTasksStore.getState().clearSelection();
    expect(useTasksStore.getState().selectedIds).toEqual([]);
  });

  it("batch completes selected tasks", async () => {
    const first = await useTasksStore.getState().createTask({ title: "批量完成一" });
    const second = await useTasksStore.getState().createTask({ title: "批量完成二" });
    useTasksStore.getState().setSelectedIds([first.id, second.id]);

    const count = await useTasksStore.getState().batchComplete([first.id, second.id]);
    expect(count).toBe(2);
    const state = useTasksStore.getState();
    expect(state.selectedIds).toEqual([]);
    expect(state.tasks.find((task) => task.id === first.id)?.status).toBe("completed");
    expect(state.tasks.find((task) => task.id === second.id)?.status).toBe("completed");
  });
});
