import { BarChart3, ClipboardList, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuditLog, Project, Task, TaskStatus } from "@task-manager/domain";
import { isTaskOverdue, rootProjectIdOf } from "../lib/taskViewModel";
import { getAdapters } from "../adapters";
import { useProjectsStore, useTasksStore } from "../stores";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待办",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

const AUDIT_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  transition: "状态变更",
  archive: "归档",
  unarchive: "取消归档",
  delete: "删除",
  restore: "恢复",
  hard_delete: "彻底删除",
  batch_complete: "批量完成",
  batch_delete: "批量删除",
  batch_restore: "批量恢复",
  batch_hard_delete: "批量彻底删除",
  batch_priority: "批量优先级",
  batch_project: "批量移动",
  batch_tags: "批量标签",
  clear_trash: "清空回收站",
  comment: "评论",
  member_add: "添加成员",
};

function statusCounts(tasks: Task[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const task of tasks) {
    counts[task.status] += 1;
  }
  return counts;
}

function projectProgress(
  tasks: Task[],
  projects: Project[],
): { id: string; name: string; total: number; done: number }[] {
  const rows = projects.map((project) => ({
    id: project.id,
    name: project.name,
    total: 0,
    done: 0,
  }));
  const inbox = { id: "__inbox", name: "收件箱", total: 0, done: 0 };
  for (const task of tasks) {
    const projectId = rootProjectIdOf(task, tasks);
    const row = projectId ? rows.find((item) => item.id === projectId) : inbox;
    if (!row) {
      continue;
    }
    row.total += 1;
    if (task.status === "completed") {
      row.done += 1;
    }
  }
  return [...rows, inbox].filter((row) => row.total > 0);
}

function assigneeLoad(tasks: Task[]): { name: string; open: number; total: number }[] {
  const map = new Map<string, { open: number; total: number }>();
  for (const task of tasks) {
    const name = task.assignee?.trim();
    if (!name) {
      continue;
    }
    const row = map.get(name) ?? { open: 0, total: 0 };
    row.total += 1;
    if (task.status !== "completed" && task.status !== "cancelled") {
      row.open += 1;
    }
    map.set(name, row);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.open - a.open);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportsView() {
  const tasks = useTasksStore((s) => s.allTasks);
  const projects = useProjectsStore((s) => s.projects);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void getAdapters()
      .audit.list(200)
      .then(setLogs)
      .catch(() => setLogs([]));
  }, []);

  const stats = useMemo(() => {
    const active = tasks.filter(
      (task) => !task.archivedAt && !task.deletedAt && task.status !== "cancelled",
    );
    const counts = statusCounts(tasks);
    const overdue = tasks.filter((task) => isTaskOverdue(task, now));
    const dueInWeek = tasks.filter((task) => {
      if (!task.dueAt || task.status === "completed" || task.status === "cancelled") {
        return false;
      }
      const due = new Date(task.dueAt).getTime();
      return due >= now && due <= now + 7 * 86400000;
    });
    const done = counts.completed;
    const rate = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
    return {
      active: active.length,
      overdue: overdue.length,
      dueInWeek: dueInWeek.length,
      done,
      rate,
      counts,
      projects: projectProgress(tasks, projects),
      assignees: assigneeLoad(tasks),
    };
  }, [now, projects, tasks]);

  const maxProject = Math.max(1, ...stats.projects.map((item) => item.total));
  const maxAssignee = Math.max(1, ...stats.assignees.map((item) => item.total));

  return (
    <section className="reports-view" aria-label="报表中心">
      <div className="reports-header">
        <div>
          <span className="reports-header__title">报表中心</span>
          <p>任务进度、人员负载和操作审计的一览视图</p>
        </div>
      </div>

      <div className="report-kpis">
        <div className="report-kpi report-kpi--primary">
          <ClipboardList size={18} />
          <div>
            <span>进行中任务</span>
            <strong>{stats.active}</strong>
          </div>
        </div>
        <div className="report-kpi report-kpi--success">
          <BarChart3 size={18} />
          <div>
            <span>完成率</span>
            <strong>{stats.rate}%</strong>
          </div>
        </div>
        <div className="report-kpi report-kpi--danger">
          <ShieldCheck size={18} />
          <div>
            <span>已逾期</span>
            <strong>{stats.overdue}</strong>
          </div>
        </div>
        <div className="report-kpi report-kpi--info">
          <Users size={18} />
          <div>
            <span>7 天内到期</span>
            <strong>{stats.dueInWeek}</strong>
          </div>
        </div>
      </div>

      <div className="report-grid">
        <section className="report-card">
          <h3>项目进度</h3>
          {stats.projects.length === 0 ? (
            <p className="report-empty">暂无项目任务</p>
          ) : (
            <div className="report-bars">
              {stats.projects.map((project) => (
                <div key={project.id} className="report-bar-row">
                  <span className="report-bar-label">{project.name}</span>
                  <div className="report-bar-track">
                    <div
                      className="report-bar-fill"
                      style={{ width: `${(project.total / maxProject) * 100}%` }}
                    />
                  </div>
                  <span className="report-bar-value">
                    {project.done}/{project.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="report-card">
          <h3>人员负载</h3>
          {stats.assignees.length === 0 ? (
            <p className="report-empty">暂无负责人数据</p>
          ) : (
            <div className="report-bars">
              {stats.assignees.map((person) => (
                <div key={person.name} className="report-bar-row">
                  <span className="report-bar-label">{person.name}</span>
                  <div className="report-bar-track">
                    <div
                      className="report-bar-fill report-bar-fill--assignee"
                      style={{ width: `${(person.total / maxAssignee) * 100}%` }}
                    />
                  </div>
                  <span className="report-bar-value">
                    {person.open} 进行中 / {person.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="report-card">
          <h3>状态分布</h3>
          <div className="status-distribution">
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
              <div key={status} className="status-distribution__row">
                <span>{STATUS_LABELS[status]}</span>
                <div className="status-distribution__track">
                  <div
                    className={`status-distribution__fill status-distribution__fill--${status}`}
                    style={{
                      width: `${tasks.length > 0 ? (stats.counts[status] / tasks.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <strong>{stats.counts[status]}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="report-card report-card--audit">
          <h3>审计日志</h3>
          {logs.length === 0 ? (
            <p className="report-empty">暂无操作记录</p>
          ) : (
            <div className="audit-log-list">
              {logs.slice(0, 60).map((log) => (
                <div key={log.id} className="audit-log-row">
                  <span className="audit-log-action">{AUDIT_LABELS[log.action] ?? log.action}</span>
                  <span className="audit-log-summary">{log.summary}</span>
                  <time>{formatTime(log.createdAt)}</time>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
