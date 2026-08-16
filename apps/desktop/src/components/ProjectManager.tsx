import { Archive, Check, Pencil, Plus, RotateCcw, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconButton, Input, Select, useToast } from "@task-manager/ui";
import type { Project, ProjectMember } from "@task-manager/domain";
import { getAdapters } from "../adapters";
import { useProjectsStore } from "../stores";
import { projectCreateSchema } from "../validation";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ProjectManager() {
  const projects = useProjectsStore((s) => s.projects);
  const createProject = useProjectsStore((s) => s.createProject);
  const updateProject = useProjectsStore((s) => s.updateProject);
  const archiveProject = useProjectsStore((s) => s.archiveProject);
  const deleteProject = useProjectsStore((s) => s.deleteProject);
  const toast = useToast();
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState("#4F6EF7");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#4F6EF7");
  const [error, setError] = useState<string | null>(null);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [membersProjectId, setMembersProjectId] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"viewer" | "editor" | "admin">("editor");
  const [memberError, setMemberError] = useState<string | null>(null);

  const loadArchived = async () => {
    try {
      const all = await getAdapters().projects.list(true);
      setArchivedProjects(all.filter((item) => item.isArchived));
    } catch {
      setArchivedProjects([]);
    }
  };

  useEffect(() => {
    void loadArchived();
  }, []);

  const handleArchive = async (id: string, name: string) => {
    try {
      await archiveProject(id);
      await loadArchived();
      toast.push({ type: "success", title: `项目已归档：${name}` });
    } catch (archiveError) {
      toast.push({ type: "danger", title: "归档失败", message: errorMessage(archiveError) });
    }
  };

  const restoreProject = async (id: string, name: string) => {
    try {
      await updateProject(id, { isArchived: false });
      await loadArchived();
      toast.push({ type: "success", title: `项目已恢复：${name}` });
    } catch (restoreError) {
      toast.push({ type: "danger", title: "恢复失败", message: errorMessage(restoreError) });
    }
  };

  const handleCreate = async () => {
    const parsed = projectCreateSchema.safeParse({
      name: createName,
      color: createColor,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "表单校验失败");
      return;
    }
    try {
      await createProject(parsed.data);
      setCreateName("");
      setCreateColor("#4F6EF7");
      setError(null);
      toast.push({ type: "success", title: "项目已创建" });
    } catch (createError) {
      toast.push({ type: "danger", title: "创建失败", message: errorMessage(createError) });
    }
  };

  const startEdit = (id: string) => {
    const project = projects.find((item) => item.id === id);
    if (!project) {
      return;
    }
    setEditingId(id);
    setEditName(project.name);
    setEditColor(project.color ?? "#4F6EF7");
  };

  const saveEdit = async () => {
    if (!editingId) {
      return;
    }
    const parsed = projectCreateSchema.safeParse({ name: editName, color: editColor });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "表单校验失败");
      return;
    }
    try {
      await updateProject(editingId, parsed.data);
      setEditingId(null);
      setError(null);
      toast.push({ type: "success", title: "项目已保存" });
    } catch (updateError) {
      toast.push({ type: "danger", title: "保存失败", message: errorMessage(updateError) });
    }
  };

  const toggleMembers = async (projectId: string) => {
    if (membersProjectId === projectId) {
      setMembersProjectId(null);
      return;
    }
    setMembersProjectId(projectId);
    setMemberName("");
    setMemberEmail("");
    setMemberError(null);
    try {
      setMembers(await getAdapters().projectMembers.list(projectId));
    } catch (memberLoadError) {
      setMemberError(errorMessage(memberLoadError));
    }
  };

  const addMember = async (projectId: string) => {
    const name = memberName.trim();
    if (!name) {
      setMemberError("请输入成员名称");
      return;
    }
    try {
      await getAdapters().projectMembers.add({
        projectId,
        name,
        email: memberEmail.trim(),
        role: memberRole,
      });
      setMemberName("");
      setMemberEmail("");
      setMemberError(null);
      setMembers(await getAdapters().projectMembers.list(projectId));
      toast.push({ type: "success", title: "成员已添加" });
    } catch (memberAddError) {
      setMemberError(errorMessage(memberAddError));
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      await getAdapters().projectMembers.remove(memberId);
      if (membersProjectId) {
        setMembers(await getAdapters().projectMembers.list(membersProjectId));
      }
    } catch (memberRemoveError) {
      setMemberError(errorMessage(memberRemoveError));
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`确定删除项目“${name}”？已有任务会移回收件箱。`)) {
      return;
    }
    try {
      await deleteProject(id);
      toast.push({ type: "success", title: "项目已删除" });
    } catch (deleteError) {
      toast.push({ type: "danger", title: "删除失败", message: errorMessage(deleteError) });
    }
  };

  return (
    <div className="entity-manager">
      <div className="entity-create">
        <Input
          label="新建项目"
          value={createName}
          onChange={(event) => {
            setCreateName(event.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          placeholder="项目名称"
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
      <div className="entity-toolbar">
        <span>{showArchived ? "已归档项目" : "项目列表"}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived ? "返回项目" : `已归档 (${archivedProjects.length})`}
        </Button>
      </div>
      {showArchived ? (
        <ul className="entity-list">
          {archivedProjects.length === 0 ? (
            <li className="entity-row">
              <span>暂无已归档项目</span>
            </li>
          ) : (
            archivedProjects.map((project) => (
              <li key={project.id} className="entity-row">
                <span
                  className="entity-swatch"
                  style={{ background: project.color ?? "#6B7280" }}
                  aria-hidden="true"
                />
                <span className="entity-row__name">{project.name}</span>
                <div className="entity-row__actions">
                  <IconButton
                    label={`恢复 ${project.name}`}
                    onClick={() => void restoreProject(project.id, project.name)}
                  >
                    <RotateCcw size={15} />
                  </IconButton>
                  <IconButton
                    label={`删除 ${project.name}`}
                    onClick={() => void remove(project.id, project.name)}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : (
        <ul className="entity-list">
          {projects.map((project) => (
            <li
              key={project.id}
              className={
                membersProjectId === project.id ? "entity-row entity-row--members" : "entity-row"
              }
            >
              <span
                className="entity-swatch"
                style={{ background: project.color ?? "#6B7280" }}
                aria-hidden="true"
              />
              {editingId === project.id ? (
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
                  <IconButton label="保存项目" onClick={() => void saveEdit()}>
                    <Check size={15} />
                  </IconButton>
                  <IconButton label="取消编辑" onClick={() => setEditingId(null)}>
                    <X size={15} />
                  </IconButton>
                </div>
              ) : (
                <span className="entity-row__name">{project.name}</span>
              )}
              <div className="entity-row__actions">
                <IconButton
                  label={`成员 ${project.name}`}
                  onClick={() => void toggleMembers(project.id)}
                >
                  <Users size={15} />
                </IconButton>
                <IconButton label={`编辑 ${project.name}`} onClick={() => startEdit(project.id)}>
                  <Pencil size={15} />
                </IconButton>
                <IconButton
                  label={`归档 ${project.name}`}
                  onClick={() => void handleArchive(project.id, project.name)}
                >
                  <Archive size={15} />
                </IconButton>
                <IconButton
                  label={`删除 ${project.name}`}
                  onClick={() => void remove(project.id, project.name)}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
              {membersProjectId === project.id ? (
                <div className="project-member-editor">
                  <div className="project-member-editor__head">
                    <strong>协作成员</strong>
                    <span className="project-member-editor__error">{memberError ?? ""}</span>
                  </div>
                  <div className="project-member-list">
                    {members.length === 0 ? (
                      <p className="detail-section__empty">暂无成员</p>
                    ) : (
                      members.map((member) => (
                        <div key={member.id} className="project-member-item">
                          <span>{member.name}</span>
                          <span>{member.email || "未填写邮箱"}</span>
                          <span>
                            {member.role === "admin"
                              ? "管理员"
                              : member.role === "editor"
                                ? "编辑"
                                : "查看"}
                          </span>
                          <IconButton
                            size="sm"
                            label={`删除成员 ${member.name}`}
                            onClick={() => void removeMember(member.id)}
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="project-member-add">
                    <Input
                      label="成员名称"
                      value={memberName}
                      onChange={(event) => {
                        setMemberName(event.target.value);
                        setMemberError(null);
                      }}
                      placeholder="例如：张三"
                    />
                    <Input
                      label="邮箱"
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      placeholder="可选"
                    />
                    <Select
                      label="角色"
                      value={memberRole}
                      onChange={(event) =>
                        setMemberRole(event.target.value as "viewer" | "editor" | "admin")
                      }
                      options={[
                        { value: "viewer", label: "查看" },
                        { value: "editor", label: "编辑" },
                        { value: "admin", label: "管理员" },
                      ]}
                    />
                    <Button size="sm" onClick={() => void addMember(project.id)}>
                      <Plus size={14} />
                      添加成员
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
