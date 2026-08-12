import {
  Boxes,
  Download,
  FileText,
  FileUp,
  Image,
  Inbox,
  Library,
  Music,
  Package,
  Plus,
  ListTodo,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { LibraryResource } from "@task-manager/domain";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@task-manager/ui";
import { getAdapters, isTauriRuntime } from "../adapters";
import type { AttachmentDraft } from "../adapters/types";
import { shouldIgnoreEnter } from "../lib/ime";
import { rootProjectIdOf } from "../lib/taskViewModel";
import { useLibraryStore, useTasksStore, useTemplatesStore, useUiStore } from "../stores";

function downloadTextFile(name: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kindIcon(kind: LibraryResource["kind"]) {
  switch (kind) {
    case "image":
      return <Image size={15} />;
    case "video":
      return <Video size={15} />;
    case "audio":
      return <Music size={15} />;
    case "document":
      return <FileText size={15} />;
    default:
      return <Package size={15} />;
  }
}

export function InboxView() {
  const tasks = useTasksStore((s) => s.allTasks);
  const createTask = useTasksStore((s) => s.createTask);
  const setFilter = useTasksStore((s) => s.setFilter);
  const templates = useTemplatesStore((s) => s.templates);
  const loadTemplates = useTemplatesStore((s) => s.loadTemplates);
  const exportTemplateJsonText = useTemplatesStore((s) => s.exportTemplateJsonText);
  const importTemplateJsonText = useTemplatesStore((s) => s.importTemplateJsonText);
  const exportTemplateFile = useTemplatesStore((s) => s.exportTemplateFile);
  const importTemplateFile = useTemplatesStore((s) => s.importTemplateFile);
  const setView = useUiStore((s) => s.setView);
  const openDetail = useUiStore((s) => s.openDetail);
  const libraryItems = useLibraryStore((s) => s.items);
  const loadLibrary = useLibraryStore((s) => s.loadLibrary);
  const addLibraryDraft = useLibraryStore((s) => s.addDraft);
  const removeLibrary = useLibraryStore((s) => s.remove);
  const toast = useToast();
  const [captureTitle, setCaptureTitle] = useState("");
  const captureRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [templateImportOpen, setTemplateImportOpen] = useState(false);
  const [templateImportText, setTemplateImportText] = useState("");

  useEffect(() => {
    void loadTemplates();
    void loadLibrary();
    window.requestAnimationFrame(() => captureRef.current?.focus());
  }, [loadTemplates, loadLibrary]);

  const uncategorized = tasks
    .filter((task) => !task.archivedAt && !task.deletedAt && !rootProjectIdOf(task, tasks))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  const handleCapture = async () => {
    const title = captureTitle.trim();
    if (!title) {
      return;
    }
    try {
      await createTask({ title, projectId: null });
      setCaptureTitle("");
      toast.push({ type: "success", title: "已存入收件箱" });
      window.requestAnimationFrame(() => captureRef.current?.focus());
    } catch (error) {
      toast.push({ type: "danger", title: "保存失败", message: errorMessage(error) });
    }
  };

  const handleImportShare = async () => {
    try {
      const result = await getAdapters().share.importFile();
      await useTasksStore.getState().refreshTasks();
      toast.push({
        type: "success",
        title: "分享任务已导入",
        message: `导入 ${result.tasks} 个任务`,
      });
    } catch (error) {
      toast.push({ type: "danger", title: "导入失败", message: errorMessage(error) });
    }
  };

  const handleUseTemplate = async (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    const main = template?.tasks[0];
    if (!template || !main) {
      return;
    }
    try {
      await createTask(main);
      toast.push({ type: "success", title: "模板任务已创建", message: main.title });
    } catch (error) {
      toast.push({ type: "danger", title: "创建失败", message: errorMessage(error) });
    }
  };

  const addLibraryFiles = async () => {
    if (isTauriRuntime()) {
      const drafts = await getAdapters().library.pickFile();
      for (const draft of drafts) {
        await addLibraryDraft(draft);
      }
      if (drafts.length > 0) {
        toast.push({ type: "success", title: "素材已加入素材库" });
      }
      return;
    }
    libraryInputRef.current?.click();
  };

  const handleExportTemplate = async (templateId: string, name: string) => {
    try {
      if (isTauriRuntime()) {
        await exportTemplateFile(templateId);
      } else {
        const jsonText = await exportTemplateJsonText(templateId);
        downloadTextFile(`${name}.task-template.json`, jsonText);
      }
      toast.push({ type: "success", title: "模板已导出" });
    } catch (error) {
      toast.push({ type: "danger", title: "导出失败", message: errorMessage(error) });
    }
  };

  const handleImportTemplateFile = async () => {
    if (isTauriRuntime()) {
      try {
        const template = await importTemplateFile();
        if (template) {
          toast.push({ type: "success", title: "模板已导入", message: template.name });
        }
      } catch (error) {
        toast.push({ type: "danger", title: "导入失败", message: errorMessage(error) });
      }
      return;
    }
    templateInputRef.current?.click();
  };

  const handleTemplateInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const template = await importTemplateJsonText(await file.text());
      toast.push({ type: "success", title: "模板已导入", message: template.name });
    } catch (error) {
      toast.push({ type: "danger", title: "导入失败", message: errorMessage(error) });
    } finally {
      event.target.value = "";
    }
  };

  const handlePasteImportTemplate = async () => {
    if (!templateImportText.trim()) {
      toast.push({ type: "warning", title: "请输入模板 JSON" });
      return;
    }
    try {
      const template = await importTemplateJsonText(templateImportText);
      setTemplateImportText("");
      setTemplateImportOpen(false);
      toast.push({ type: "success", title: "模板已导入", message: template.name });
    } catch (error) {
      toast.push({ type: "danger", title: "导入失败", message: errorMessage(error) });
    }
  };

  const handleLibraryInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }
    try {
      for (const file of files) {
        const draft: AttachmentDraft = {
          key: `library-${Date.now()}-${file.name}`,
          name: file.name,
          sizeBytes: file.size,
          file,
        };
        await addLibraryDraft(draft);
      }
      toast.push({ type: "success", title: "素材已加入素材库" });
    } catch (error) {
      toast.push({ type: "danger", title: "素材保存失败", message: errorMessage(error) });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="inbox-view" aria-label="收件箱视图">
      <div className="inbox-view__capture">
        <div className="inbox-view__capture-icon">
          <Inbox size={18} />
        </div>
        <Input
          ref={captureRef}
          value={captureTitle}
          onChange={(event) => setCaptureTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !shouldIgnoreEnter(event)) {
              event.preventDefault();
              void handleCapture();
            }
          }}
          placeholder="输入想法，回车存入收件箱"
          aria-label="收件箱速记"
        />
        <Button onClick={() => void handleCapture()}>
          <Plus size={14} />
          存入
        </Button>
      </div>

      <div className="inbox-view__grid">
        <section className="inbox-card">
          <header className="inbox-card__header">
            <div className="inbox-card__title">
              <ListTodo size={16} />
              <h2>最近收集</h2>
            </div>
            <Badge tone="neutral">{uncategorized.length}</Badge>
          </header>
          {uncategorized.length === 0 ? (
            <EmptyState icon={<Inbox size={20} />} title="暂无未分类内容" />
          ) : (
            <div className="inbox-capture-list">
              {uncategorized.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="inbox-capture-item"
                  onClick={() => openDetail(task.id)}
                >
                  <Badge
                    tone={
                      task.priority === "urgent"
                        ? "danger"
                        : task.priority === "high"
                          ? "warning"
                          : task.priority === "medium"
                            ? "primary"
                            : "neutral"
                    }
                  >
                    {task.priority === "none"
                      ? "未分类"
                      : task.priority === "low"
                        ? "低"
                        : task.priority === "medium"
                          ? "中"
                          : task.priority === "high"
                            ? "高"
                            : "紧急"}
                  </Badge>
                  <span>{task.title}</span>
                  <time>{new Date(task.createdAt).toLocaleDateString("zh-CN")}</time>
                </button>
              ))}
            </div>
          )}
          <footer className="inbox-card__footer">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setView("tasks");
                setFilter({ projectId: null });
              }}
            >
              查看全部未分类
            </Button>
          </footer>
        </section>

        <section className="inbox-card">
          <header className="inbox-card__header">
            <div className="inbox-card__title">
              <Boxes size={16} />
              <h2>分享与模板</h2>
            </div>
          </header>
          <Button
            variant="secondary"
            className="inbox-card__action"
            onClick={() => void handleImportShare()}
          >
            <FileUp size={14} />
            导入分享任务
          </Button>
          <Button
            variant="secondary"
            className="inbox-card__action"
            onClick={() => void handleImportTemplateFile()}
          >
            <Download size={14} />
            导入模板
          </Button>
          <input
            ref={templateInputRef}
            type="file"
            accept="application/json,.json"
            className="attachment-editor__input"
            onChange={(event) => void handleTemplateInput(event)}
          />
          <div className="inbox-template-list">
            {templates.length === 0 ? (
              <p className="inbox-card__empty">暂无模板</p>
            ) : (
              templates.slice(0, 4).map((template) => {
                const main = template.tasks[0];
                const count = (main.children ?? []).length;
                return (
                  <div key={template.id} className="inbox-template-item">
                    <div>
                      <strong>{template.name}</strong>
                      <span>{count > 0 ? `${count} 个大任务` : "无拆解"}</span>
                    </div>
                    <div className="inbox-template-item__actions">
                      <Button
                        size="sm"
                        onClick={() => void handleExportTemplate(template.id, template.name)}
                      >
                        导出
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleUseTemplate(template.id)}
                      >
                        使用
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setTemplateImportOpen(true)}>
            <Download size={14} />
            粘贴导入模板
          </Button>
        </section>

        <section className="inbox-card">
          <header className="inbox-card__header">
            <div className="inbox-card__title">
              <Library size={16} />
              <h2>常用资源</h2>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void addLibraryFiles()}>
              <Plus size={14} />
              添加素材
            </Button>
            <input
              ref={libraryInputRef}
              type="file"
              multiple
              className="attachment-editor__input"
              onChange={(event) => void handleLibraryInput(event)}
            />
          </header>
          {libraryItems.length === 0 ? (
            <EmptyState icon={<Package size={20} />} title="素材库为空" />
          ) : (
            <div className="inbox-library-list">
              {libraryItems.map((item) => (
                <div key={item.id} className="inbox-library-item">
                  <span className="inbox-library-item__icon">{kindIcon(item.kind)}</span>
                  <span className="inbox-library-item__name">{item.name}</span>
                  <span className="inbox-library-item__size">{formatSize(item.sizeBytes)}</span>
                  <IconButton
                    size="sm"
                    label={`删除素材 ${item.name}`}
                    onClick={() => void removeLibrary(item.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={templateImportOpen}
        onClose={() => setTemplateImportOpen(false)}
        title="粘贴导入模板"
        description="粘贴导出的模板 JSON，导入后进入任务模板列表。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTemplateImportOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handlePasteImportTemplate()}>导入</Button>
          </>
        }
      >
        <Textarea
          label="模板 JSON"
          value={templateImportText}
          onChange={(event) => setTemplateImportText(event.target.value)}
          rows={12}
          placeholder='{"schemaVersion":1,"name":"会议模板","tasks":[]}'
        />
      </Modal>
    </section>
  );
}
