import { Activity, AlertTriangle, CalendarClock } from "lucide-react";

export type OverviewKind = "today" | "overdue" | "in_progress";

interface TopbarOverviewProps {
  todayCount: number;
  overdueCount: number;
  inProgressCount: number;
  onSelect: (kind: OverviewKind) => void;
}

export function TopbarOverview({
  todayCount,
  overdueCount,
  inProgressCount,
  onSelect,
}: TopbarOverviewProps) {
  return (
    <div className="topbar-overview" role="group" aria-label="今日概览">
      <button
        type="button"
        className="topbar-stat topbar-stat--primary"
        title="今天到期"
        onClick={() => onSelect("today")}
      >
        <CalendarClock size={14} />
        <strong>{todayCount}</strong>
        <span>今天到期</span>
      </button>
      <button
        type="button"
        className="topbar-stat topbar-stat--danger"
        title="逾期任务"
        onClick={() => onSelect("overdue")}
      >
        <AlertTriangle size={14} />
        <strong>{overdueCount}</strong>
        <span>逾期</span>
      </button>
      <button
        type="button"
        className="topbar-stat topbar-stat--info"
        title="进行中"
        onClick={() => onSelect("in_progress")}
      >
        <Activity size={14} />
        <strong>{inProgressCount}</strong>
        <span>进行中</span>
      </button>
    </div>
  );
}
