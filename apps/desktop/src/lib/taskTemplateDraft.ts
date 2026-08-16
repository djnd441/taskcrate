import type { TaskCreateInput, TaskPriority, TaskResourceInput } from "@task-manager/domain";
import type { DraftTaskNode } from "../components/TaskBreakdownEditor";
import type { DraftResource } from "../components/TaskResourceEditor";

let draftKey = 0;

function nextKey(prefix: string): string {
  draftKey += 1;
  return `${prefix}-${Date.now()}-${draftKey}`;
}

function toLocalDateTime(value: string | null | undefined): string {
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

export function taskResourceToDraft(resource: TaskResourceInput): DraftResource {
  return {
    key: nextKey("template-resource"),
    name: resource.name,
    kind: resource.kind,
    quantity: resource.quantity,
    unit: resource.unit,
    status: resource.status,
    notes: resource.notes,
  };
}

export function taskInputToDraftNode(input: TaskCreateInput): DraftTaskNode {
  return {
    key: nextKey("template-task"),
    kind: input.taskKind ?? "main",
    title: input.title,
    dueLocal: toLocalDateTime(input.dueAt),
    priority: (input.priority ?? "none") as TaskPriority,
    assignee: input.assignee ?? "",
    notes: input.notes ?? "",
    resources: (input.resources ?? []).map(taskResourceToDraft),
    children: (input.children ?? []).map(taskInputToDraftNode),
  };
}

export function taskInputsToDraftNodes(inputs: TaskCreateInput[]): DraftTaskNode[] {
  return inputs.map(taskInputToDraftNode);
}
