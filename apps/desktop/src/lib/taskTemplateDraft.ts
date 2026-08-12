import type { TaskCreateInput, TaskResourceInput } from "@task-manager/domain";
import type { DraftTaskNode } from "../components/TaskBreakdownEditor";
import type { DraftResource } from "../components/TaskResourceEditor";

let draftKey = 0;

function nextKey(prefix: string): string {
  draftKey += 1;
  return `${prefix}-${Date.now()}-${draftKey}`;
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
    resources: (input.resources ?? []).map(taskResourceToDraft),
    children: (input.children ?? []).map(taskInputToDraftNode),
  };
}

export function taskInputsToDraftNodes(inputs: TaskCreateInput[]): DraftTaskNode[] {
  return inputs.map(taskInputToDraftNode);
}