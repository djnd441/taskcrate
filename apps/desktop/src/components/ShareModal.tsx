import { Copy, FileJson, Link2, Package } from "lucide-react";
import type { Task } from "@task-manager/domain";
import { Button, Modal, useToast } from "@task-manager/ui";
import { getAdapters } from "../adapters";
import { useProjectsStore } from "../stores";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ShareModal({
  open,
  task,
  onClose,
}: {
  open: boolean;
  task: Task;
  onClose: () => void;
}) {
  const projects = useProjectsStore((s) => s.projects);
  const toast = useToast();
  const projectName =
    projects.find((project) => project.id === task.projectId)?.name ?? "收件箱";

  const summary = [
    `任务：${task.title}`,
    `状态：${task.status}`,
    `优先级：${task.priority}`,
    `项目：${projectName}`,
    task.dueAt ? `截止：${new Date(task.dueAt).toLocaleString("zh-CN")}` : null,
    task.notes ? `备注：${task.notes}` : null,
    task.resources.length > 0
      ? `工具/资源：${task.resources.map((item) => item.name).join("、")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      toast.push({ type: "success", title: "任务摘要已复制" });
    } catch (error) {
      toast.push({ type: "danger", title: "复制失败", message: errorMessage(error) });
    }
  };

  const exportTask = async () => {
    try {
      const result = await getAdapters().share.exportTask(task.id);
      toast.push({ type: "success", title: "任务文件已导出", message: result.path });
    } catch (error) {
      toast.push({ type: "danger", title: "导出失败", message: errorMessage(error) });
    }
  };

  const exportZip = async () => {
    try {
      const path = await getAdapters().attachments.package(task.id);
      toast.push({ type: "success", title: "ZIP 已导出", message: path });
    } catch (error) {
      toast.push({ type: "danger", title: "导出失败", message: errorMessage(error) });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="分享任务"
      description="分享主任务箱子的任务结构、工具资源和附件"
    >
      <div className="share-options">
        <button type="button" className="share-option" onClick={() => void copySummary()}>
          <Copy size={18} />
          <span>
            <strong>复制任务摘要</strong>
            <small>复制标题、状态、优先级、截止时间和备注</small>
          </span>
        </button>
        <button type="button" className="share-option" onClick={() => void exportTask()}>
          <FileJson size={18} />
          <span>
            <strong>导出任务文件</strong>
            <small>生成 .task 文件，可再次导入</small>
          </span>
        </button>
        <button type="button" className="share-option" onClick={() => void exportZip()}>
          <Package size={18} />
          <span>
            <strong>导出 ZIP 包</strong>
            <small>包含附件、任务清单和任务数据</small>
          </span>
        </button>
        <div className="share-option share-option--disabled">
          <Link2 size={18} />
          <span>
            <strong>局域网分享链接</strong>
            <small>后续版本开放</small>
          </span>
        </div>
      </div>
      <div className="share-actions">
        <Button variant="secondary" onClick={onClose}>
          关闭
        </Button>
      </div>
    </Modal>
  );
}