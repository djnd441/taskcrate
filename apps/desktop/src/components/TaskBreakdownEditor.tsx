import { Plus, Trash2 } from "lucide-react";
import type { TaskKind, TaskPriority } from "@task-manager/domain";
import { Badge, Button, IconButton, Input, Select, Textarea } from "@task-manager/ui";
import { TaskResourceEditor, type DraftResource } from "./TaskResourceEditor";

export interface DraftTaskNode {
  key: string;
  kind: TaskKind;
  title: string;
  dueLocal: string;
  priority: TaskPriority;
  assignee: string;
  notes: string;
  resources: DraftResource[];
  children: DraftTaskNode[];
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "none", label: "无" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

let draftTaskKey = 0;

function newDraftTask(kind: TaskKind): DraftTaskNode {
  draftTaskKey += 1;
  return {
    key: `task-${Date.now()}-${draftTaskKey}`,
    kind,
    title: "",
    dueLocal: "",
    priority: "none",
    assignee: "",
    notes: "",
    resources: [],
    children: [],
  };
}

function TaskNodeFields({
  node,
  onPatch,
}: {
  node: DraftTaskNode;
  onPatch: (patch: Partial<DraftTaskNode>) => void;
}) {
  return (
    <div className="breakdown-node__fields">
      <Input
        label="截止时间"
        type="datetime-local"
        value={node.dueLocal}
        onChange={(event) => onPatch({ dueLocal: event.target.value })}
      />
      <Select
        label="优先级"
        value={node.priority}
        onChange={(event) => onPatch({ priority: event.target.value as TaskPriority })}
        options={PRIORITY_OPTIONS}
      />
      <Input
        label="负责人"
        value={node.assignee}
        onChange={(event) => onPatch({ assignee: event.target.value })}
        placeholder="例如：张三"
      />
      <Textarea
        label="备注"
        value={node.notes}
        onChange={(event) => onPatch({ notes: event.target.value })}
        placeholder="补充说明"
      />
    </div>
  );
}

export function TaskBreakdownEditor({
  value,
  onChange,
}: {
  value: DraftTaskNode[];
  onChange: (nodes: DraftTaskNode[]) => void;
}) {
  const updateNode = (key: string, patch: Partial<DraftTaskNode>) => {
    onChange(value.map((node) => (node.key === key ? { ...node, ...patch } : node)));
  };

  const updateChildren = (key: string, children: DraftTaskNode[]) => {
    onChange(value.map((node) => (node.key === key ? { ...node, children } : node)));
  };

  const patchChild = (majorKey: string, childKey: string, patch: Partial<DraftTaskNode>) => {
    const major = value.find((node) => node.key === majorKey);
    if (!major) {
      return;
    }
    updateChildren(
      majorKey,
      major.children.map((child) => (child.key === childKey ? { ...child, ...patch } : child)),
    );
  };

  const addMajor = () => {
    onChange([...value, newDraftTask("major")]);
  };

  const addMinor = (majorKey: string) => {
    const major = value.find((node) => node.key === majorKey);
    if (!major) {
      return;
    }
    updateChildren(majorKey, [...major.children, newDraftTask("minor")]);
  };

  const removeNode = (key: string) => {
    onChange(value.filter((node) => node.key !== key));
  };

  const minorCount = value.reduce((sum, node) => sum + node.children.length, 0);

  return (
    <section className="create-editor-section">
      <header className="create-editor-section__header">
        <h3>任务拆解</h3>
        <span className="breakdown-count">
          {value.length} 个大任务 · {minorCount} 个小任务
        </span>
        <Button size="sm" variant="secondary" onClick={addMajor}>
          <Plus size={14} />
          添加大任务
        </Button>
      </header>
      <p className="create-editor-section__empty">主任务下可拆出大任务，大任务下再拆小任务</p>
      {value.map((major) => (
        <div key={major.key} className="breakdown-node">
          <div className="breakdown-node__row">
            <Badge tone="info">大任务</Badge>
            <Input
              label=""
              value={major.title}
              onChange={(event) => updateNode(major.key, { title: event.target.value })}
              placeholder="输入大任务标题"
            />
            <IconButton
              label={`删除大任务 ${major.title || "未命名"}`}
              onClick={() => removeNode(major.key)}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
          <TaskNodeFields node={major} onPatch={(patch) => updateNode(major.key, patch)} />
          <div className="breakdown-node__children">
            {major.children.map((minor) => (
              <div key={minor.key} className="breakdown-node__child">
                <div className="breakdown-node__row">
                  <Badge tone="primary">小任务</Badge>
                  <Input
                    label=""
                    value={minor.title}
                    onChange={(event) =>
                      patchChild(major.key, minor.key, { title: event.target.value })
                    }
                    placeholder="输入小任务标题"
                  />
                  <IconButton
                    label={`删除小任务 ${minor.title || "未命名"}`}
                    onClick={() =>
                      updateChildren(
                        major.key,
                        major.children.filter((child) => child.key !== minor.key),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
                <TaskNodeFields
                  node={minor}
                  onPatch={(patch) => patchChild(major.key, minor.key, patch)}
                />
                <TaskResourceEditor
                  label="小任务工具与资源"
                  resources={minor.resources}
                  onChange={(resources) => patchChild(major.key, minor.key, { resources })}
                />
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => addMinor(major.key)}>
              <Plus size={14} />
              添加小任务
            </Button>
          </div>
          <TaskResourceEditor
            label="大任务工具与资源"
            resources={major.resources}
            onChange={(resources) => updateNode(major.key, { resources })}
          />
        </div>
      ))}
      {value.length === 0 ? <p className="create-editor-section__empty">尚未添加大任务</p> : null}
    </section>
  );
}

export { newDraftTask };
