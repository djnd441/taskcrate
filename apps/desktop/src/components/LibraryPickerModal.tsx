import { FileText, Image, Music, Package, Video, Trash2 } from "lucide-react";
import { useEffect } from "react";
import type { LibraryResource } from "@task-manager/domain";
import { Button, EmptyState, IconButton, Modal } from "@task-manager/ui";
import { useLibraryStore } from "../stores";

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
      return <Image size={16} />;
    case "video":
      return <Video size={16} />;
    case "audio":
      return <Music size={16} />;
    case "document":
      return <FileText size={16} />;
    default:
      return <Package size={16} />;
  }
}

export function LibraryPickerModal({
  open,
  onClose,
  onSelect,
  title = "从素材库添加",
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (resource: LibraryResource) => void;
  title?: string;
}) {
  const items = useLibraryStore((s) => s.items);
  const loading = useLibraryStore((s) => s.loading);
  const loadLibrary = useLibraryStore((s) => s.loadLibrary);
  const remove = useLibraryStore((s) => s.remove);

  useEffect(() => {
    if (open) {
      void loadLibrary();
    }
  }, [open, loadLibrary]);

  return (
    <Modal open={open} onClose={onClose} title={title} description="选择常用素材，添加到当前任务">
      <div className="library-picker">
        {loading ? (
          <p className="library-picker__empty">正在读取素材库...</p>
        ) : items.length === 0 ? (
          <EmptyState icon={<Package size={20} />} title="素材库为空" />
        ) : (
          <div className="library-picker__list">
            {items.map((item) => (
              <div key={item.id} className="library-picker__item">
                <span className="library-picker__icon">{kindIcon(item.kind)}</span>
                <span className="library-picker__name">{item.name}</span>
                <span className="library-picker__size">{formatSize(item.sizeBytes)}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  选择
                </Button>
                <IconButton
                  size="sm"
                  label={`删除素材 ${item.name}`}
                  onClick={() => void remove(item.id)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
