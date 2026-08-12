import {
  Archive,
  Boxes,
  CalendarRange,
  Check,
  ChevronDown,
  ClipboardList,
  Library,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  REPEAT_FREQUENCIES,
  taskTreeToCreateInput,
  type RepeatFrequency,
  type TaskComment,
  type TaskKind,
  type TaskPriority,
  type TaskStatus,
} from "@task-manager/domain";
import {
  Badge,
  Button,
  Checkbox,
  IconButton,
  Input,
  Select,
  Textarea,
  useToast,
} from "@task-manager/ui";
import { getAdapters } from "../adapters";
import type { AttachmentDraft } from "../adapters/types";
import { useProjectsStore, useTagsStore, useTasksStore } from "../stores";
import { selectAllTaskById } from "../stores/selectors";
import { useUiStore } from "../stores/uiStore";
import { taskUpdateSchema } from "../validation";
import { draftToResourceInput, TaskResourceEditor, type DraftResource } from "./TaskResourceEditor";
import { AttachmentEditor } from "./AttachmentEditor";
import { ShareModal } from "./ShareModal";
import { SaveTemplateModal } from "./SaveTemplateModal";
import { LibraryPickerModal } from "./LibraryPickerModal";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "待办" },
  { value: "in_progress", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待办",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "none", label: "无" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "无",
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

const KIND_LABELS: Record<TaskKind, string> = {
  main: "主任务",
  major: "大任务",
  minor: "小任务",
};

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DetailPanel() {
  const detailOpen = useUiStore((s) => s.detailOpen);
  const activeTaskId = useUiStore((s) => s.activeTaskId);
  const closeDetail = useUiStore((s) => s.closeDetail);
  const openDetail = useUiStore((s) => s.openDetail);
  const task = useTasksStore(selectAllTaskById(activeTaskId ?? ""));
  const tasks = useTasksStore((s) => s.allTasks);
  const projects = useProjectsStore((s) => s.projects);
  const tags = useTagsStore((s) => s.tags);
  const createTask = useTasksStore((s) => s.createTask);
  const updateTask = useTasksStore((s) => s.updateTask);
  const transitionStatus = useTasksStore((s) => s.transitionStatus);
  const archive = useTasksStore((s) => s.archive);
  const unarchive = useTasksStore((s) => s.unarchive);
  const softDelete = useTasksStore((s) => s.softDelete);
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>("none");
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndsLocal, setRepeatEndsLocal] = useState("");
  const [assignee, setAssignee] = useState("");
  const [department, setDepartment] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [doneCriteria, setDoneCriteria] = useState("");
  const [budget, setBudget] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [projectId, setProjectId] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [resources, setResources] = useState<DraftResource[]>([]);
  const [attachmentDrafts, setAttachmentDrafts] = useState<AttachmentDraft[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("我");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [childKind, setChildKind] = useState<TaskKind>("major");
  const [childTitle, setChildTitle] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) {
      return;
    }
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDueLocal(toLocalDateTime(task.dueAt));
    setRepeatFrequency(task.repeatFrequency);
    setRepeatInterval(task.repeatInterval);
    setRepeatEndsLocal(toLocalDateTime(task.repeatEndsAt));
    setAssignee(task.assignee ?? "");
    setDepartment(task.department ?? "");
    setStartLocal(toLocalDateTime(task.startAt));
    setDoneCriteria(task.doneCriteria ?? "");
    setBudget(task.budget ?? "");
    setPriority(task.priority);
    setProjectId(task.projectId ?? "");
    setSelectedTagIds(task.tagIds);
    setResources(
      task.resources.map((resource) => ({
        key: resource.id,
        name: resource.name,
        kind: resource.kind,
        quantity: resource.quantity,
        unit: resource.unit,
        status: resource.status,
        notes: resource.notes,
      })),
    );
    void getAdapters()
      .attachments.list(task.id)
      .then((attachments) =>
        setAttachmentDrafts(
          attachments.map((attachment) => ({
            key: attachment.id,
            name: attachment.name,
            sizeBytes: attachment.sizeBytes,
          })),
        ),
      );
    void getAdapters()
      .comments.list(task.id)
      .then(setComments)
      .catch(() => setComments([]));
    setCommentDraft("");
    setCommentError(null);
    setChildKind(task.taskKind === "major" ? "minor" : "major");
    setChildTitle("");
    setLibraryPickerOpen(false);
    setError(null);
  }, [task?.id]);

  if (!detailOpen || !task) {
    return null;
  }

  const children = tasks.filter((item) => item.parentId === task.id);
  const canAddChildren = task.taskKind === "main" || task.taskKind === "major";

  const handleAttachDrafts = async (drafts: AttachmentDraft[]) => {
    try {
      for (const draft of drafts) {
        const attachment = await getAdapters().attachments.add(task.id, draft);
        setAttachmentDrafts((current) => [
          ...current,
          {
            key: attachment.id,
            name: attachment.name,
            sizeBytes: attachment.sizeBytes,
          },
        ]);
      }
      toast.push({ type: "success", title: "附件已添加" });
    } catch (attachmentError) {
      toast.push({
        type: "danger",
        title: "附件添加失败",
        message: errorMessage(attachmentError),
      });
    }
  };

  const handleRemoveDraft = async (draft: AttachmentDraft) => {
    try {
      await getAdapters().attachments.remove(draft.key);
      setAttachmentDrafts((current) => current.filter((item) => item.key !== draft.key));
    } catch (removeError) {
      toast.push({
        type: "danger",
        title: "附件删除失败",
        message: errorMessage(removeError),
      });
    }
  };

  const handleLibrarySelect = async (resource: { id: string; name: string; sizeBytes: number }) => {
    try {
      const attachment = await getAdapters().library.copyToTask(resource.id, task.id);
      setAttachmentDrafts((current) => [
        ...current,
        {
          key: attachment.id,
          name: attachment.name,
          sizeBytes: attachment.sizeBytes,
        },
      ]);
      toast.push({ type: "success", title: "素材已添加到任务" });
    } catch (libraryError) {
      toast.push({ type: "danger", title: "添加失败", message: errorMessage(libraryError) });
    }
  };

  const handlePackage = async () => {
    try {
      const path = await getAdapters().attachments.package(task.id);
      toast.push({ type: "success", title: "打包完成", message: path });
    } catch (packageError) {
      toast.push({
        type: "danger",
        title: "打包失败",
        message: errorMessage(packageError),
      });
    }
  };

  const handleAddComment = async () => {
    const content = commentDraft.trim();
    if (!content) {
      setCommentError("请输入评论内容");
      return;
    }
    try {
      await getAdapters().comments.add({
        taskId: task.id,
        author: commentAuthor.trim() || "我",
        content,
      });
      setCommentDraft("");
      setCommentError(null);
      setComments(await getAdapters().comments.list(task.id));
      toast.push({ type: "success", title: "评论已发布" });
    } catch (commentError) {
      setCommentError(errorMessage(commentError));
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  };

  const handleSave = async () => {
    const parsed = taskUpdateSchema.safeParse({
      title,
      notes,
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
      tagIds: selectedTagIds,
      resources: resources.map(draftToResourceInput),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "表单校验失败");
      return;
    }
    try {
      await updateTask(task.id, parsed.data);
      setError(null);
      toast.push({ type: "success", title: "任务已保存" });
    } catch (saveError) {
      toast.push({ type: "danger", title: "保存失败", message: errorMessage(saveError) });
    }
  };

  const handleStatusChange = async (value: string) => {
    try {
      await transitionStatus(task.id, value as TaskStatus);
    } catch (statusError) {
      toast.push({
        type: "danger",
        title: "状态变更失败",
        message: errorMessage(statusError),
      });
    }
  };

  return (
    <aside className="detail-panel" aria-label="任务详情">
      <header className="detail-panel__header">
        <div className="detail-panel__heading">
          <h2 className="detail-panel__title">{task.title}</h2>
          <div className="detail-panel__badges">
            <Badge
              tone={
                task.status === "completed"
                  ? "success"
                  : task.status === "in_progress"
                    ? "info"
                    : task.status === "cancelled"
                      ? "neutral"
                      : "primary"
              }
            >
              {STATUS_LABELS[task.status]}
            </Badge>
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
              {PRIORITY_LABELS[task.priority]}
            </Badge>
          </div>
        </div>
        <IconButton label="关闭详情" onClick={closeDetail}>
          <X size={16} />
        </IconButton>
      </header>

      <div className="detail-form">
        <details className="detail-group" open>
          <summary className="detail-group__summary">
            <ClipboardList size={14} />
            <span className="detail-group__label">基本信息</span>
            <ChevronDown size={14} />
          </summary>
          <div className="detail-group__body">
            <Input
              label="标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              error={error ?? undefined}
            />
            <Textarea
              label="备注"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="补充任务说明"
            />
            <Select
              label="状态"
              value={task.status}
              onChange={(event) => void handleStatusChange(event.target.value)}
              options={STATUS_OPTIONS}
            />
            <Select
              label="优先级"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
              options={PRIORITY_OPTIONS}
            />
            <Select
              label="项目"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              placeholder="收件箱（不选择项目）"
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
            />
            <fieldset className="detail-tag-picker">
              <legend>标签</legend>
              <div className="detail-tag-options">
                {tags.map((tag) => (
                  <Checkbox
                    key={tag.id}
                    label={tag.name}
                    checked={selectedTagIds.includes(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                  />
                ))}
                {tags.length === 0 ? <span className="detail-tag-empty">暂无标签</span> : null}
              </div>
            </fieldset>
          </div>
        </details>

        <details className="detail-group" open>
          <summary className="detail-group__summary">
            <CalendarRange size={14} />
            <span className="detail-group__label">计划执行</span>
            <ChevronDown size={14} />
          </summary>
          <div className="detail-group__body">
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
          </div>
        </details>

        <details className="detail-group" open>
          <summary className="detail-group__summary">
            <Boxes size={14} />
            <span className="detail-group__label">任务拆解</span>
            <Badge
              tone={
                task.taskKind === "main"
                  ? "primary"
                  : task.taskKind === "major"
                    ? "info"
                    : "neutral"
              }
            >
              {KIND_LABELS[task.taskKind]}
            </Badge>
            <ChevronDown size={14} />
          </summary>
          <div className="detail-group__body">
            {children.length === 0 ? (
              <p className="detail-section__empty">暂无子任务</p>
            ) : (
              <div className="detail-child-list">
                {children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className="detail-child"
                    onClick={() => openDetail(child.id)}
                  >
                    <Badge tone={child.taskKind === "major" ? "info" : "primary"}>
                      {KIND_LABELS[child.taskKind]}
                    </Badge>
                    <span>{child.title}</span>
                  </button>
                ))}
              </div>
            )}
            {canAddChildren ? (
              <div className="detail-child-add">
                <Input
                  label=""
                  value={childTitle}
                  onChange={(event) => setChildTitle(event.target.value)}
                  placeholder={task.taskKind === "main" ? "输入大任务标题" : "输入小任务标题"}
                />
                <Select
                  label=""
                  value={childKind}
                  onChange={(event) => setChildKind(event.target.value as TaskKind)}
                  options={
                    task.taskKind === "main"
                      ? [{ value: "major", label: "大任务" }]
                      : [{ value: "minor", label: "小任务" }]
                  }
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    const title = childTitle.trim();
                    if (!title) {
                      return;
                    }
                    try {
                      await createTask({
                        title,
                        taskKind: childKind,
                        parentId: task.id,
                      });
                      setChildTitle("");
                      toast.push({ type: "success", title: "子任务已添加" });
                    } catch (childError) {
                      toast.push({
                        type: "danger",
                        title: "添加失败",
                        message: errorMessage(childError),
                      });
                    }
                  }}
                >
                  <Plus size={14} />
                  添加
                </Button>
              </div>
            ) : null}
          </div>
        </details>

        <details className="detail-group" open>
          <summary className="detail-group__summary">
            <Boxes size={14} />
            <span className="detail-group__label">资源附件</span>
            <ChevronDown size={14} />
          </summary>
          <div className="detail-group__body">
            <TaskResourceEditor label="工具与资源" resources={resources} onChange={setResources} />
            <AttachmentEditor
              value={attachmentDrafts}
              onChange={setAttachmentDrafts}
              onPersistAdd={handleAttachDrafts}
              onPersistRemove={handleRemoveDraft}
              onPackage={handlePackage}
            />
            <Button size="sm" variant="secondary" onClick={() => setLibraryPickerOpen(true)}>
              <Library size={14} />
              从素材库添加
            </Button>
          </div>
        </details>
      </div>

      <details className="detail-group detail-group--comments" open>
        <summary className="detail-group__summary">
          <MessageSquare size={14} />
          <span className="detail-group__label">协作评论</span>
          <span className="detail-section__hint">@某人 会推送协作通知</span>
          <ChevronDown size={14} />
        </summary>
        <div className="detail-group__body">
          <div className="comment-list">
            {comments.length === 0 ? (
              <p className="detail-section__empty">暂无评论</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="comment-item">
                  <div className="comment-item__head">
                    <strong>{comment.author}</strong>
                    <time>{new Date(comment.createdAt).toLocaleString("zh-CN")}</time>
                  </div>
                  <p>{comment.content}</p>
                  <IconButton
                    size="sm"
                    label="删除评论"
                    onClick={() =>
                      void getAdapters()
                        .comments.remove(comment.id)
                        .then(async () => {
                          setComments(await getAdapters().comments.list(task.id));
                        })
                    }
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              ))
            )}
          </div>
          <div className="comment-editor">
            <Input
              label="评论人"
              value={commentAuthor}
              onChange={(event) => setCommentAuthor(event.target.value)}
            />
            <Textarea
              label="评论内容"
              value={commentDraft}
              onChange={(event) => {
                setCommentDraft(event.target.value);
                setCommentError(null);
              }}
              error={commentError ?? undefined}
              placeholder="@成员名 输入评论"
            />
            <Button size="sm" onClick={() => void handleAddComment()}>
              发布评论
            </Button>
          </div>
        </div>
      </details>

      <div className="detail-actions">
        <Button size="sm" onClick={() => void handleSave()}>
          <Check size={14} />
          保存
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)}>
          <Share2 size={14} />
          分享
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setSaveTemplateOpen(true)}>
          <Save size={14} />
          存为模板
        </Button>
        {task.archivedAt ? (
          <IconButton label="取消归档" onClick={() => void unarchive(task.id)}>
            <RotateCcw size={16} />
          </IconButton>
        ) : (
          <IconButton label="归档任务" onClick={() => void archive(task.id)}>
            <Archive size={16} />
          </IconButton>
        )}
        <IconButton label="删除任务" onClick={() => void softDelete(task.id)}>
          <Trash2 size={16} />
        </IconButton>
      </div>
      <ShareModal open={shareOpen} task={task} onClose={() => setShareOpen(false)} />
      <LibraryPickerModal
        open={libraryPickerOpen}
        onClose={() => setLibraryPickerOpen(false)}
        onSelect={(resource) => void handleLibrarySelect(resource)}
      />
      <SaveTemplateModal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        defaultName={task.title}
        tasks={[taskTreeToCreateInput(task, tasks)]}
        projectId={task.projectId}
      />
    </aside>
  );
}
