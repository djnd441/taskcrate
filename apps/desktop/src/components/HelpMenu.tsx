import { CircleHelp, Github, Keyboard, MessageSquareText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { githubRepoUrl } from "@task-manager/domain";
import { IconButton, Menu, Popover } from "@task-manager/ui";
import { openExternal } from "../bridge";
import { FeedbackModal } from "./FeedbackModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { UpdateModal } from "./UpdateModal";

type HelpModal = "shortcuts" | "feedback" | "update" | null;

export function HelpMenu() {
  const [modal, setModal] = useState<HelpModal>(null);

  return (
    <>
      <Popover
        align="end"
        trigger={
          <IconButton label="帮助">
            <CircleHelp size={16} />
          </IconButton>
        }
      >
        <Menu
          items={[
            {
              label: "键盘快捷键",
              icon: <Keyboard size={14} />,
              onSelect: () => setModal("shortcuts"),
            },
            {
              label: "反馈",
              icon: <MessageSquareText size={14} />,
              onSelect: () => setModal("feedback"),
            },
            {
              label: "检查更新",
              icon: <RefreshCw size={14} />,
              onSelect: () => setModal("update"),
            },
            {
              label: "GitHub 仓库",
              icon: <Github size={14} />,
              onSelect: () => {
                void openExternal(githubRepoUrl);
              },
            },
          ]}
        />
      </Popover>
      <KeyboardShortcutsModal
        open={modal === "shortcuts"}
        onClose={() => setModal(null)}
      />
      <FeedbackModal open={modal === "feedback"} onClose={() => setModal(null)} />
      <UpdateModal open={modal === "update"} onClose={() => setModal(null)} />
    </>
  );
}
