import { FileText, Image, Package, Plus, Trash2 } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { Button, IconButton } from "@task-manager/ui";
import { getAdapters, isTauriRuntime } from "../adapters";
import type { AttachmentDraft } from "../adapters/types";

function formatSize(bytes: number): string {
  if (!bytes) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentEditor({
  value,
  onChange,
  onPersistAdd,
  onPersistRemove,
  onPackage,
}: {
  value: AttachmentDraft[];
  onChange: (drafts: AttachmentDraft[]) => void;
  onPersistAdd?: (drafts: AttachmentDraft[]) => Promise<void>;
  onPersistRemove?: (draft: AttachmentDraft) => Promise<void>;
  onPackage?: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addDrafts = (drafts: AttachmentDraft[]) => {
    if (onPersistAdd) {
      void onPersistAdd(drafts);
    } else {
      onChange([...value, ...drafts]);
    }
  };

  const addFromPicker = async () => {
    if (!isTauriRuntime()) {
      inputRef.current?.click();
      return;
    }
    const drafts = await getAdapters().attachments.pickFiles();
    if (drafts.length > 0) {
      addDrafts(drafts);
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }
    addDrafts(
      files.map((file, index) => ({
        key: `attachment-${Date.now()}-${index}`,
        name: file.name,
        sizeBytes: file.size,
        file,
      })),
    );
    event.target.value = "";
  };

  const removeDraft = (draft: AttachmentDraft) => {
    if (onPersistRemove) {
      void onPersistRemove(draft);
    } else {
      onChange(value.filter((item) => item.key !== draft.key));
    }
  };

  const isImage = (draft: AttachmentDraft) => /image\//.test(draft.file?.type ?? "");

  return (
    <section className="create-editor-section attachment-editor">
      <header className="create-editor-section__header">
        <h3>附件箱</h3>
        <Button size="sm" variant="secondary" onClick={() => void addFromPicker()}>
          <Plus size={14} />
          添加附件
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="attachment-editor__input"
          onChange={handleInput}
        />
      </header>
      {value.length === 0 ? (
        <p className="create-editor-section__empty">箱子还是空的，添加文件、照片等附件</p>
      ) : (
        <div className="attachment-editor__list">
          {value.map((draft) => (
            <div key={draft.key} className="attachment-editor__row">
              {isImage(draft) ? <Image size={15} /> : <FileText size={15} />}
              <span className="attachment-editor__name">{draft.name}</span>
              <span className="attachment-editor__size">{formatSize(draft.sizeBytes)}</span>
              <IconButton
                size="sm"
                label={`删除附件 ${draft.name}`}
                onClick={() => removeDraft(draft)}
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      {onPackage ? (
        <Button size="sm" variant="secondary" onClick={() => void onPackage()}>
          <Package size={14} />
          打包下载
        </Button>
      ) : null}
    </section>
  );
}
