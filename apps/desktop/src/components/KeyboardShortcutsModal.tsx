import { Kbd, Modal } from "@task-manager/ui";

interface ShortcutRow {
  keys: string[];
  description: string;
}

const GROUPS: { title: string; rows: ShortcutRow[] }[] = [
  {
    title: "全局",
    rows: [
      { keys: ["Ctrl", "N"], description: "新建任务" },
      { keys: ["Ctrl", "Shift", "Space"], description: "全局速记到收件箱" },
      { keys: ["Ctrl", "K"], description: "打开命令面板" },
      { keys: ["Ctrl", "Shift", "F"], description: "聚焦任务搜索" },
      { keys: ["Esc"], description: "关闭弹窗/详情" },
    ],
  },
  {
    title: "视图切换",
    rows: [
      { keys: ["Ctrl", "1"], description: "任务列表" },
      { keys: ["Ctrl", "2"], description: "看板" },
      { keys: ["Ctrl", "3"], description: "回收站" },
      { keys: ["Ctrl", "4"], description: "设置" },
    ],
  },
  {
    title: "命令面板",
    rows: [
      { keys: ["↑"], description: "上一条" },
      { keys: ["↓"], description: "下一条" },
      { keys: ["Enter"], description: "执行选中项" },
    ],
  },
  {
    title: "快速新建",
    rows: [
      { keys: ["Enter"], description: "创建并继续录入" },
    ],
  },
];

export function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="键盘快捷键" size="md">
      <div className="shortcut-groups">
        {GROUPS.map((group) => (
          <section key={group.title} className="shortcut-group">
            <h3>{group.title}</h3>
            <div className="shortcut-list">
              {group.rows.map((row) => (
                <div key={`${group.title}-${row.description}`} className="shortcut-row">
                  <div className="shortcut-row__keys">
                    {row.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </div>
                  <span>{row.description}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
