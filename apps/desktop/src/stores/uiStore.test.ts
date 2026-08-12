import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      view: "tasks",
      sidebarOpen: false,
      detailOpen: false,
      activeTaskId: null,
      commandPaletteOpen: false,
      quickCreateOpen: false,
    });
  });

  it("switches views and closes the sidebar", () => {
    const store = useUiStore.getState();
    store.toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(true);

    useUiStore.getState().setView("board");
    expect(useUiStore.getState().view).toBe("board");
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it("opens and closes the task detail panel", () => {
    useUiStore.getState().openDetail("task-1");
    expect(useUiStore.getState().detailOpen).toBe(true);
    expect(useUiStore.getState().activeTaskId).toBe("task-1");

    useUiStore.getState().closeDetail();
    expect(useUiStore.getState().detailOpen).toBe(false);
    expect(useUiStore.getState().activeTaskId).toBeNull();
  });

  it("enters inbox and exits back to the task list", () => {
    useUiStore.getState().enterInbox();
    expect(useUiStore.getState().view).toBe("inbox");

    useUiStore.getState().exitInbox();
    expect(useUiStore.getState().view).toBe("tasks");
  });

  it("toggles floating panels", () => {
    useUiStore.getState().setCommandPaletteOpen(true);
    useUiStore.getState().setQuickCreateOpen(true);
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
    expect(useUiStore.getState().quickCreateOpen).toBe(true);
  });
});
