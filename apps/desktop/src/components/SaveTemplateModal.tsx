import { useState } from "react";
import type { TaskCreateInput } from "@task-manager/domain";
import { Button, Input, Modal, useToast } from "@task-manager/ui";
import { useTemplatesStore } from "../stores";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SaveTemplateModal({
  open,
  onClose,
  defaultName,
  tasks,
  projectId = null,
}: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  tasks: TaskCreateInput[];
  projectId?: string | null;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createTemplate = useTemplatesStore((s) => s.createTemplate);
  const toast = useToast();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入模板名称");
      return;
    }
    try {
      await createTemplate({ name: trimmed, projectId, tasks });
      setError(null);
      setName("");
      toast.push({ type: "success", title: "模板已保存" });
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="保存为模板"
      description="保存当前主任务的拆解结构与工具资源，之后可一键套用。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()}>保存模板</Button>
        </>
      }
    >
      <div className="save-template-form">
        <Input
          label="模板名称"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          placeholder={defaultName || "例如：周报模板"}
          autoFocus
        />
      </div>
    </Modal>
  );
}