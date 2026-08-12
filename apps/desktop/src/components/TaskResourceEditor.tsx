import { Plus, Trash2 } from "lucide-react";
import type {
  ResourceKind,
  ResourceStatus,
  TaskResourceInput,
} from "@task-manager/domain";
import { RESOURCE_KINDS, RESOURCE_STATUSES } from "@task-manager/domain";
import { Button, IconButton, Input, Select } from "@task-manager/ui";

export interface DraftResource {
  key: string;
  name: string;
  kind: ResourceKind;
  quantity: string;
  unit: string;
  status: ResourceStatus;
  notes: string;
}

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  tool: "工具",
  material: "物料",
  people: "人员",
  budget: "预算",
  other: "其他",
};

export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  pending: "待准备",
  ready: "已准备",
  in_use: "使用中",
  done: "已完成",
};

let draftResourceKey = 0;

export function newDraftResource(): DraftResource {
  draftResourceKey += 1;
  return {
    key: `resource-${Date.now()}-${draftResourceKey}`,
    name: "",
    kind: "tool",
    quantity: "",
    unit: "",
    status: "pending",
    notes: "",
  };
}

export function draftToResourceInput(
  resource: DraftResource,
  index: number,
): TaskResourceInput {
  return {
    name: resource.name,
    kind: resource.kind,
    quantity: resource.quantity,
    unit: resource.unit,
    status: resource.status,
    notes: resource.notes,
    sortOrder: index,
  };
}

export function TaskResourceEditor({
  label = "工具与资源",
  resources,
  onChange,
}: {
  label?: string;
  resources: DraftResource[];
  onChange: (resources: DraftResource[]) => void;
}) {
  const update = (key: string, patch: Partial<DraftResource>) => {
    onChange(
      resources.map((resource) =>
        resource.key === key ? { ...resource, ...patch } : resource,
      ),
    );
  };

  return (
    <section className="create-editor-section">
      <header className="create-editor-section__header">
        <h3>{label}</h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange([...resources, newDraftResource()])}
        >
          <Plus size={14} />
          添加
        </Button>
      </header>
      {resources.length === 0 ? (
        <p className="create-editor-section__empty">尚未添加工具或资源</p>
      ) : (
        <div className="resource-editor-list">
          {resources.map((resource, index) => (
            <div key={resource.key} className="resource-editor-row">
              <Input
                label={`名称 ${index + 1}`}
                value={resource.name}
                onChange={(event) => update(resource.key, { name: event.target.value })}
                placeholder="例如：电脑、预算、协作者"
              />
              <Select
                label="类型"
                value={resource.kind}
                onChange={(event) =>
                  update(resource.key, { kind: event.target.value as ResourceKind })
                }
                options={RESOURCE_KINDS.map((kind) => ({
                  value: kind,
                  label: RESOURCE_KIND_LABELS[kind],
                }))}
              />
              <Input
                label="数量"
                value={resource.quantity}
                onChange={(event) => update(resource.key, { quantity: event.target.value })}
                placeholder="例如：2"
              />
              <Input
                label="单位"
                value={resource.unit}
                onChange={(event) => update(resource.key, { unit: event.target.value })}
                placeholder="例如：个、小时"
              />
              <Select
                label="状态"
                value={resource.status}
                onChange={(event) =>
                  update(resource.key, { status: event.target.value as ResourceStatus })
                }
                options={RESOURCE_STATUSES.map((status) => ({
                  value: status,
                  label: RESOURCE_STATUS_LABELS[status],
                }))}
              />
              <Input
                label="备注"
                value={resource.notes}
                onChange={(event) => update(resource.key, { notes: event.target.value })}
                placeholder="可选说明"
              />
              <div className="resource-editor-row__remove">
                <IconButton
                  label={`删除 ${resource.name || "工具/资源"}`}
                  onClick={() =>
                    onChange(resources.filter((item) => item.key !== resource.key))
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
