import { useEffect, useState } from "react";
import type { UpdateStatus } from "@task-manager/domain";
import { Button, Modal, useToast } from "@task-manager/ui";
import { getAdapters } from "../adapters";
import { openExternal } from "../bridge";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("zh-CN");
}

export function UpdateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const result = await getAdapters().data.checkUpdate();
      setStatus(result);
    } catch (error) {
      toast.push({ type: "danger", title: "检查更新失败", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="检查更新"
      description="通过 GitHub Releases 检查 TaskCrate 新版本。"
      footer={
        <>
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            重新检查
          </Button>
          <Button onClick={onClose}>关闭</Button>
        </>
      }
    >
      <div className="update-status">
        <div className="update-status__row">
          <span>当前版本</span>
          <strong>{status?.currentVersion ?? "0.1.0"}</strong>
        </div>
        {status ? (
          <>
            <div className="update-status__row">
              <span>最新版本</span>
              <strong>{status.latestVersion ? `v${status.latestVersion}` : "—"}</strong>
            </div>
            <div className="update-status__row">
              <span>状态</span>
              <strong>
                {loading
                  ? "检查中..."
                  : status.latestVersion === null
                    ? "暂无发布"
                    : status.hasUpdate
                      ? "发现新版本"
                      : "已是最新"}
              </strong>
            </div>
            {status.releaseName ? (
              <div className="update-status__row">
                <span>Release</span>
                <strong>{status.releaseName}</strong>
              </div>
            ) : null}
            {status.publishedAt ? (
              <div className="update-status__row">
                <span>发布时间</span>
                <strong>{formatDate(status.publishedAt)}</strong>
              </div>
            ) : null}
            <p className="update-status__message">{status.message}</p>
            {status.releaseNotes ? (
              <div className="update-status__notes">
                <p>更新内容</p>
                <pre>{status.releaseNotes}</pre>
              </div>
            ) : null}
            {status.releaseUrl ? (
              <div className="update-status__actions">
                {status.hasUpdate && status.updateUrl ? (
                  <Button onClick={() => void openExternal(status.updateUrl as string)}>
                    下载安装包
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => void openExternal(status.releaseUrl as string)}
                >
                  查看 Release
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
