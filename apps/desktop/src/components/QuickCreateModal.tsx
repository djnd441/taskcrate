import { useEffect, useRef, useState } from "react";
import { ArrowRight, Boxes, Library, Save, X } from "lucide-react";
import {
  REPEAT_FREQUENCIES,
  type RepeatFrequency,
  type TaskCreateInput,
  type TaskPriority,
  type TaskTemplate,
  type LibraryResource,
} from "@task-manager/domain";
import { Button, IconButton, Input, Modal, Select, Textarea, useToast } from "@task-manager/ui";
import { getAdapters } from "../adapters";
import type { AttachmentDraft } from "../adapters/types";
import { shouldIgnoreEnter } from "../lib/ime";
import { useProjectsStore, useTasksStore, useTemplatesStore } from "../stores";
import { useUiStore } from "../stores/uiStore";
import { taskCreateSchema } from "../validation";
import { TaskBreakdownEditor, type DraftTaskNode } from "./TaskBreakdownEditor";
import { draftToResourceInput, TaskResourceEditor, type DraftResource } from "./TaskResourceEditor";
import { AttachmentEditor } from "./AttachmentEditor";
import { SaveTemplateModal } from "./SaveTemplateModal";
import { LibraryPickerModal } from "./LibraryPickerModal";
import { taskInputToDraftNode } from "../lib/taskTemplateDraft";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toLocalDateTime(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function draftToTaskInput(node: DraftTaskNode): TaskCreateInput {
  return {
    title: node.title,
    taskKind: node.kind,
    dueAt: node.dueLocal ? new Date(node.dueLocal).toISOString() : null,
    priority: node.priority ?? "none",
    assignee: node.assignee.trim() ? node.assignee.trim() : null,
    notes: node.notes.trim() ? node.notes : null,
    resources: node.resources.map(draftToResourceInput),
    children: node.children.map(draftToTaskInput),
  };
}

export function QuickCreateModal() {
  const open = useUiStore((s) => s.quickCreateOpen);
  const closeQuickCreate = useUiStore((s) => s.closeQuickCreate);
  const quickCreateRequestToken = useUiStore((s) => s.quickCreateRequestToken);
  const createTask = useTasksStore((s) => s.createTask);
  const projects = useProjectsStore((s) => s.projects);
  const toast = useToast();
  const [step, setStep] = useState<"title" | "editor">("title");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueLocal, setDueLocal] = useState("");
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>("none");
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndsLocal, setRepeatEndsLocal] = useState("");
  const [assignee, setAssignee] = useState("");
  const [department, setDepartment] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [doneCriteria, setDoneCriteria] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [mainResources, setMainResources] = useState<DraftResource[]>([]);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [majorTasks, setMajorTasks] = useState<DraftTaskNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [libraryItems, setLibraryItems] = useState<LibraryResource[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);
  const templates = useTemplatesStore((s) => s.templates);
  const loadTemplates = useTemplatesStore((s) => s.loadTemplates);

  useEffect(() => {
    if (!open) {
      return;
    }
    const draft = useUiStore.getState().quickCreateDraftTitle;
    setStep(draft.trim() ? "editor" : "title");
    setTitle(draft);
    setProjectId("");
    setPriority("none");
    setDueLocal("");
    setRepeatFrequency("none");
    setRepeatInterval(1);
    setRepeatEndsLocal("");
    setAssignee("");
    setDepartment("");
    setStartLocal("");
    setDoneCriteria("");
    setBudget("");
    setNotes("");
    setMainResources([]);
    setAttachments([]);
    setMajorTasks([]);
    setShowTemplates(false);
    setSaveTemplateOpen(false);
    setLibraryItems([]);
    setLibraryPickerOpen(false);
    setError(null);
    void loadTemplates();
    window.requestAnimationFrame(() => titleRef.current?.focus());
  }, [open, quickCreateRequestToken]);

  const enterEditor = () => {
    setStep("editor");
    window.requestAnimationFrame(() => titleRef.current?.focus());
  };

  const applyTemplate = (template: TaskTemplate) => {
    const main = template.tasks[0];
    const node = taskInputToDraftNode(main);
    setTitle(main.title);
    setProjectId(main.projectId ?? "");
    setPriority(main.priority ?? "none");
    setDueLocal(main.dueAt ? toLocalDateTime(main.dueAt) : "");
    setRepeatFrequency(main.repeatFrequency ?? "none");
    setRepeatInterval(main.repeatInterval ?? 1);
    setRepeatEndsLocal(main.repeatEndsAt ? toLocalDateTime(main.repeatEndsAt) : "");
    setAssignee(main.assignee ?? "");
    setDepartment(main.department ?? "");
    setStartLocal(main.startAt ? toLocalDateTime(main.startAt) : "");
    setDoneCriteria(main.doneCriteria ?? "");
    setBudget(main.budget ?? "");
    setNotes(main.notes ?? "");
    setMainResources(node.resources);
    setMajorTasks(node.children);
    setAttachments([]);
    setError(null);
    setShowTemplates(false);
    setStep("editor");
  };

  const minorTaskCount = majorTasks.reduce((total, major) => total + major.children.length, 0);
  const resourceCount = mainResources.length + attachments.length;

  const submit = async () => {
    const parsed = taskCreateSchema.safeParse({
      title,
      notes: notes.trim() ? notes : null,
      dueAt: dueLocal ? new Date(dueLocal).toISOString() : null,
      repeatFrequency,
      repeatInterval,
      repeatEndsAt: repeatEndsLocal ? new Date(repeatEndsLocal).toISOString() : null,
      assignee: assignee.trim() ? assignee.trim() : null,
      department: department.trim() ? department.trim() : null,
      startAt: startLocal ? new Date(startLocal).toISOString() : null,
      doneCriteria: doneCriteria.trim() ? doneCriteria.trim() : null,
      budget: budget.trim() ? budget.trim() : null,
      priority,
      projectId: projectId || null,
      taskKind: "main",
      resources: mainResources.map(draftToResourceInput),
      children: majorTasks.map(draftToTaskInput),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "表单校验失败");
      return;
    }
    try {
      const task = await createTask(parsed.data);
      try {
        for (const draft of attachments) {
          await getAdapters().attachments.add(task.id, draft);
        }
        for (const item of libraryItems) {
          await getAdapters().library.copyToTask(item.id, task.id);
        }
      } catch (attachmentError) {
        setAttachments([]);
        setLibraryItems([]);
        closeQuickCreate();
        toast.push({
          type: "warning",
          title: "任务已创建，部分附件未添加",
          message: errorMessage(attachmentError),
        });
        return;
      }
      setAttachments([]);
      setLibraryItems([]);
      await useTasksStore.getState().refreshTasks();
      setError(null);
      closeQuickCreate();
      toast.push({ type: "success", title: "任务已创建" });
    } catch (createError) {
      setError(errorMessage(createError));
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={closeQuickCreate}
        size="lg"
        title={step === "title" ? "新建任务" : "编辑任务"}
        description={
          step === "title"
            ? "输入主任务标题，回车开始拆解"
            : "主任务容器内拆分大任务和小任务，并配置工具资源"
        }
        footer={
          step === "title" ? (
            showTemplates ? (
              <Button variant="secondary" onClick={() => setShowTemplates(false)}>
                返回输入
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={closeQuickCreate}>
                  取消
                </Button>
                <Button variant="secondary" onClick={() => setShowTemplates(true)}>
                  <Boxes size={14} />
                  从模板
                </Button>
                <Button onClick={enterEditor}>
                  <ArrowRight size={14} />
                  开始拆解
                </Button>
              </>
            )
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep("title")}>
                上一步
              </Button>
              <Button variant="secondary" onClick={() => setSaveTemplateOpen(true)}>
                <Save size={14} />
                保存为模板
              </Button>
              <Button disabled={!title.trim()} onClick={() => void submit()}>
                完成创建
              </Button>
            </>
          )
        }
      >
        <div className="quick-create-steps" aria-label="创建步骤">
          <span
            className={
              step === "title"
                ? "quick-create-steps__item quick-create-steps__item--active"
                : "quick-create-steps__item quick-create-steps__item--done"
            }
          >
            1 标题
          </span>
          <span className="quick-create-steps__line" />
          <span
            className={
              step === "editor"
                ? "quick-create-steps__item quick-create-steps__item--active"
                : "quick-create-steps__item"
            }
          >
            2 拆解配置
          </span>
        </div>
        {step === "title" ? (
          showTemplates ? (
            <div className="template-picker">
              <p className="template-picker__hint">
                选择模板后进入编辑，可继续调整标题、日期与拆解。
              </p>
              {templates.length === 0 ? (
                <p className="template-picker__empty">
                  暂无模板。先手动创建主任务，在编辑页点“保存为模板”。
                </p>
              ) : (
                <div className="template-picker__list">
                  {templates.map((template) => {
                    const main = template.tasks[0];
                    const count = (main.children ?? []).length;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className="template-picker__item"
                        onClick={() => applyTemplate(template)}
                      >
                        <span className="template-picker__name">{template.name}</span>
                        <span className="template-picker__meta">
                          {count > 0 ? `${count} 个大任务` : "无拆解"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="quick-create-form">
              <Input
                ref={titleRef}
                label="任务标题"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !shouldIgnoreEnter(event)) {
                    event.preventDefault();
                    enterEditor();
                  }
                }}
                error={error ?? undefined}
                placeholder="例如：整理季度计划"
                autoFocus
              />
            </div>
          )
        ) : (
          <div className="create-editor">
            <div className="create-editor-summary" aria-label="创建内容概览">
              <span>{majorTasks.length} 个大任务</span>
              <span>{minorTaskCount} 个小任务</span>
              <span>{resourceCount} 项资源/附件</span>
            </div>
            <section className="create-editor-section">
              <header className="create-editor-section__header">
                <h3>主任务信息</h3>
                <span
                  className={`priority-swatch priority-swatch--${priority}`}
                  aria-label={`优先级：${priority}`}
                />
              </header>
              <div className="create-basic-grid">
                <Input
                  ref={titleRef}
                  label="任务标题"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError(null);
                  }}
                  error={error ?? undefined}
                />
                <Select
                  label="项目"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  placeholder="收件箱（不选择项目）"
                  options={projects.map((project) => ({
                    value: project.id,
                    label: project.name,
                  }))}
                />
                <Select
                  label="优先级"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as TaskPriority)}
                  options={[
                    { value: "none", label: "无" },
                    { value: "low", label: "低" },
                    { value: "medium", label: "中" },
                    { value: "high", label: "高" },
                    { value: "urgent", label: "紧急" },
                  ]}
                />
                <Input
                  label="截止时间"
                  type="datetime-local"
                  value={dueLocal}
                  onChange={(event) => setDueLocal(event.target.value)}
                />
                <Select
                  label="重复"
                  value={repeatFrequency}
                  onChange={(event) => setRepeatFrequency(event.target.value as RepeatFrequency)}
                  options={REPEAT_FREQUENCIES.map((frequency) => ({
                    value: frequency,
                    label:
                      frequency === "custom"
                        ? `自定义（每 ${repeatInterval} 天）`
                        : frequency === "daily"
                          ? "每天"
                          : frequency === "weekly"
                            ? "每周"
                            : frequency === "monthly"
                              ? "每月"
                              : "不重复",
                  }))}
                />
                {repeatFrequency !== "none" ? (
                  <Input
                    label="重复间隔"
                    type="number"
                    min={1}
                    value={repeatInterval}
                    onChange={(event) => setRepeatInterval(Number(event.target.value) || 1)}
                  />
                ) : null}
                {repeatFrequency !== "none" ? (
                  <Input
                    label="重复截止（可选）"
                    type="datetime-local"
                    value={repeatEndsLocal}
                    onChange={(event) => setRepeatEndsLocal(event.target.value)}
                  />
                ) : null}
                <Input
                  label="负责人"
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  placeholder="例如：张三"
                />
                <Input
                  label="部门"
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  placeholder="例如：产品部"
                />
                <Input
                  label="开始时间"
                  type="datetime-local"
                  value={startLocal}
                  onChange={(event) => setStartLocal(event.target.value)}
                />
                <Textarea
                  label="完成标准"
                  value={doneCriteria}
                  onChange={(event) => setDoneCriteria(event.target.value)}
                  placeholder="怎样算完成，例如：验收通过并交付"
                />
                <Input
                  label="预算"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  placeholder="例如：5000 元"
                />
                <Textarea
                  label="备注"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="补充任务说明"
                />
              </div>
            </section>
            <TaskBreakdownEditor value={majorTasks} onChange={setMajorTasks} />
            <TaskResourceEditor
              label="主任务工具与资源"
              resources={mainResources}
              onChange={setMainResources}
            />
            <AttachmentEditor value={attachments} onChange={setAttachments} />
            <div className="quick-create-library">
              <Button size="sm" variant="secondary" onClick={() => setLibraryPickerOpen(true)}>
                <Library size={14} />
                从素材库添加
              </Button>
              {libraryItems.length > 0 ? (
                <div className="quick-create-library__list">
                  {libraryItems.map((item) => (
                    <span key={item.id} className="quick-create-library__item">
                      {item.name}
                      <IconButton
                        size="sm"
                        label={`移除素材 ${item.name}`}
                        onClick={() =>
                          setLibraryItems((current) =>
                            current.filter((entry) => entry.id !== item.id),
                          )
                        }
                      >
                        <X size={12} />
                      </IconButton>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Modal>
      <LibraryPickerModal
        open={libraryPickerOpen}
        onClose={() => setLibraryPickerOpen(false)}
        onSelect={(resource) =>
          setLibraryItems((current) =>
            current.some((item) => item.id === resource.id) ? current : [...current, resource],
          )
        }
      />
      <SaveTemplateModal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        defaultName={title.trim() || "未命名模板"}
        tasks={[
          {
            title,
            notes: notes.trim() ? notes : null,
            dueAt: dueLocal ? new Date(dueLocal).toISOString() : null,
            repeatFrequency,
            repeatInterval,
            repeatEndsAt: repeatEndsLocal ? new Date(repeatEndsLocal).toISOString() : null,
            assignee: assignee.trim() ? assignee.trim() : null,
            department: department.trim() ? department.trim() : null,
            startAt: startLocal ? new Date(startLocal).toISOString() : null,
            doneCriteria: doneCriteria.trim() ? doneCriteria.trim() : null,
            budget: budget.trim() ? budget.trim() : null,
            priority,
            projectId: projectId || null,
            taskKind: "main",
            resources: mainResources.map(draftToResourceInput),
            children: majorTasks.map(draftToTaskInput),
          },
        ]}
        projectId={projectId || null}
      />
    </>
  );
}
