import { useEffect, useState } from "react";
import { appVersion } from "@task-manager/domain";
import { healthCheck } from "../bridge";
import { Button, Modal, Select, Textarea, useToast } from "@task-manager/ui";
import { buildFeedbackText, copyFeedbackText, downloadFeedbackFile } from "../lib/feedback";

const FEEDBACK_TYPES = ["问题反馈", "功能建议", "其他"] as const;

export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<string>("问题反馈");
  const [description, setDescription] = useState("");
  const [resolvedVersion, setResolvedVersion] = useState(appVersion);
  const toast = useToast();

  useEffect(() => {
    void healthCheck()
      .then((info) => setResolvedVersion(info.version))
      .catch(() => undefined);
  }, []);

  const buildInput = () => ({
    type,
    description,
    appVersion: resolvedVersion,
    platform: navigator.platform || "未知",
    userAgent: navigator.userAgent,
  });

  const handleCopy = async () => {
    const copied = await copyFeedbackText(buildFeedbackText(buildInput()));
    toast.push({
      type: copied ? "success" : "danger",
      title: copied ? "反馈内容已复制" : "复制失败",
    });
  };

  const handleExport = () => {
    downloadFeedbackFile(buildFeedbackText(buildInput()));
    toast.push({ type: "success", title: "反馈文件已导出" });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="反馈"
      description="生成包含版本与系统信息的反馈内容，可复制或导出后发送给开发者。"
      footer={
        <>
          <Button variant="secondary" onClick={() => void handleCopy()}>
            复制反馈内容
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            导出反馈文件
          </Button>
          <Button onClick={onClose}>关闭</Button>
        </>
      }
    >
      <div className="feedback-form">
        <Select
          label="反馈类型"
          value={type}
          onChange={(event) => setType(event.target.value)}
          options={FEEDBACK_TYPES.map((item) => ({ value: item, label: item }))}
        />
        <Textarea
          label="反馈描述"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="请描述遇到的问题或建议"
          rows={8}
        />
        <p className="feedback-version">应用版本 {resolvedVersion}</p>
      </div>
    </Modal>
  );
}
