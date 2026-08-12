import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, Input, useToast } from "@task-manager/ui";
import { useTagsStore } from "../stores";
import { tagCreateSchema } from "../validation";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TagManager() {
  const tags = useTagsStore((s) => s.tags);
  const createTag = useTagsStore((s) => s.createTag);
  const updateTag = useTagsStore((s) => s.updateTag);
  const deleteTag = useTagsStore((s) => s.deleteTag);
  const toast = useToast();
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState("#0EA5E9");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#0EA5E9");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const parsed = tagCreateSchema.safeParse({
      name: createName,
      color: createColor,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "表单校验失败");
      return;
    }
    try {
      await createTag(parsed.data);
      setCreateName("");
      setCreateColor("#0EA5E9");
      setError(null);
      toast.push({ type: "success", title: "标签已创建" });
    } catch (createError) {
      toast.push({ type: "danger", title: "创建失败", message: errorMessage(createError) });
    }
  };

  const startEdit = (id: string) => {
    const tag = tags.find((item) => item.id === id);
    if (!tag) {
      return;
    }
    setEditingId(id);
    setEditName(tag.name);
    setEditColor(tag.color ?? "#0EA5E9");
  };

  const saveEdit = async () => {
    if (!editingId) {
      return;
    }
    const parsed = tagCreateSchema.safeParse({ name: editName, color: editColor });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "表单校验失败");
      return;
    }
    try {
      await updateTag(editingId, parsed.data);
      setEditingId(null);
      setError(null);
      toast.push({ type: "success", title: "标签已保存" });
    } catch (updateError) {
      toast.push({ type: "danger", title: "保存失败", message: errorMessage(updateError) });
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`确定删除标签“${name}”？任务中的该标签会被移除。`)) {
      return;
    }
    try {
      await deleteTag(id);
      toast.push({ type: "success", title: "标签已删除" });
    } catch (deleteError) {
      toast.push({ type: "danger", title: "删除失败", message: errorMessage(deleteError) });
    }
  };

  return (
    <div className="entity-manager">
      <div className="entity-create">
        <Input
          label="新建标签"
          value={createName}
          onChange={(event) => {
            setCreateName(event.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          placeholder="标签名称"
        />
        <Input
          label="颜色"
          type="color"
          value={createColor}
          onChange={(event) => setCreateColor(event.target.value)}
        />
        <Button onClick={() => void handleCreate()}>
          <Plus size={14} />
          添加
        </Button>
      </div>
      <ul className="entity-list">
        {tags.map((tag) => (
          <li key={tag.id} className="entity-row">
            <span
              className="entity-swatch"
              style={{ background: tag.color ?? "#0EA5E9" }}
              aria-hidden="true"
            />
            {editingId === tag.id ? (
              <div className="entity-edit">
                <Input
                  label="名称"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
                <Input
                  label="颜色"
                  type="color"
                  value={editColor}
                  onChange={(event) => setEditColor(event.target.value)}
                />
                <IconButton label="保存标签" onClick={() => void saveEdit()}>
                  <Check size={15} />
                </IconButton>
                <IconButton label="取消编辑" onClick={() => setEditingId(null)}>
                  <X size={15} />
                </IconButton>
              </div>
            ) : (
              <span className="entity-row__name">{tag.name}</span>
            )}
            <div className="entity-row__actions">
              <IconButton label={`编辑 ${tag.name}`} onClick={() => startEdit(tag.id)}>
                <Pencil size={15} />
              </IconButton>
              <IconButton label={`删除 ${tag.name}`} onClick={() => void remove(tag.id, tag.name)}>
                <Trash2 size={15} />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
