import { Bell, Bot, Database, Download, FileJson, FileSpreadsheet, Folder, HardDrive, KeyRound, Layers, Palette, PlugZap, RefreshCw, Trash2, Upload, Volume2, Webhook } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AiProvider, SettingsPatch, ThemeMode } from "@task-manager/domain";
import { Button, Checkbox, IconButton, Input, Modal, Select, Textarea, useToast } from "@task-manager/ui";
import { getAdapters } from "../adapters";
import { ProjectManager } from "../components/ProjectManager";
import { TagManager } from "../components/TagManager";
import { useDataStore, useSettingsStore, useTemplatesStore } from "../stores";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { value: "light", label: "亮色", icon: <span className="theme-swatch theme-swatch--light" /> },
  { value: "dark", label: "暗色", icon: <span className="theme-swatch theme-swatch--dark" /> },
  { value: "system", label: "跟随系统", icon: <Database size={15} /> },
];

const SETTING_SECTIONS = [
  { id: "appearance", label: "外观", icon: <Palette size={15} /> },
  { id: "reminders", label: "提醒", icon: <Bell size={15} /> },
  { id: "backup", label: "自动备份", icon: <Database size={15} /> },
  { id: "notifications", label: "协作通知", icon: <Webhook size={15} /> },
  { id: "ai", label: "AI 助手", icon: <Bot size={15} /> },
  { id: "data", label: "数据与恢复", icon: <HardDrive size={15} /> },
  { id: "entities", label: "项目与标签", icon: <Folder size={15} /> },
  { id: "templates", label: "任务模板", icon: <Layers size={15} /> },
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsView() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const summary = useDataStore((s) => s.summary);
  const loadBackups = useDataStore((s) => s.loadBackups);
  const backupNow = useDataStore((s) => s.backupNow);
  const exportJson = useDataStore((s) => s.exportJson);
  const exportCsv = useDataStore((s) => s.exportCsv);
  const exportExcel = useDataStore((s) => s.exportExcel);
  const importCsvFile = useDataStore((s) => s.importCsvFile);
  const importExcelFile = useDataStore((s) => s.importExcelFile);
  const importJsonFile = useDataStore((s) => s.importJsonFile);
  const importJsonText = useDataStore((s) => s.importJsonText);
  const restoreBackupFile = useDataStore((s) => s.restoreBackupFile);
  const templates = useTemplatesStore((s) => s.templates);
  const loadTemplates = useTemplatesStore((s) => s.loadTemplates);
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate);
  const toast = useToast();
  const [activeSection, setActiveSection] = useState("appearance");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  useEffect(() => {
    void loadBackups();
    void loadTemplates();
  }, [loadBackups, loadTemplates]);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const apply = async (patch: SettingsPatch) => {
    try {
      await updateSettings(patch);
      toast.push({ type: "success", title: "设置已保存" });
    } catch (error) {
      toast.push({ type: "danger", title: "保存失败", message: errorMessage(error) });
    }
  };

  const handleBackup = async () => {
    try {
      const info = await backupNow();
      toast.push({ type: "success", title: "备份完成", message: info.path });
    } catch (error) {
      toast.push({ type: "danger", title: "备份失败", message: errorMessage(error) });
    }
  };

  const handleExport = async (kind: "json" | "csv" | "excel") => {
    try {
      const result =
        kind === "json" ? await exportJson() : kind === "excel" ? await exportExcel() : await exportCsv();
      toast.push({ type: "success", title: "导出完成", message: `${result.count} 项 · ${result.path}` });
    } catch (error) {
      toast.push({ type: "danger", title: "导出失败", message: errorMessage(error) });
    }
  };

  const handleImportSpreadsheet = async (kind: "csv" | "excel") => {
    try {
      const result = kind === "csv" ? await importCsvFile() : await importExcelFile();
      toast.push({
        type: "success",
        title: "导入完成",
        message: `任务 ${result.tasks} · 项目 ${result.projects} · 标签 ${result.tags}`,
      });
    } catch (error) {
      toast.push({ type: "danger", title: "导入失败", message: errorMessage(error) });
    }
  };

  const handleImportFile = async () => {
    try {
      const result = await importJsonFile(replaceMode);
      toast.push({
        type: "success",
        title: "导入完成",
        message: `项目 ${result.projects} · 标签 ${result.tags} · 任务 ${result.tasks}`,
      });
    } catch (error) {
      toast.push({ type: "danger", title: "导入失败", message: errorMessage(error) });
    }
  };

  const handleImportText = async () => {
    if (!importText.trim()) {
      toast.push({ type: "warning", title: "请输入 JSON 内容" });
      return;
    }
    try {
      const result = await importJsonText(importText, replaceMode);
      setImportText("");
      setImportOpen(false);
      toast.push({
        type: "success",
        title: "导入完成",
        message: `项目 ${result.projects} · 标签 ${result.tags} · 任务 ${result.tasks}`,
      });
    } catch (error) {
      toast.push({ type: "danger", title: "导入失败", message: errorMessage(error) });
    }
  };

  const handleRestoreBackup = async () => {
    if (!window.confirm("恢复会覆盖当前任务、项目、素材库和附件，是否继续？")) {
      return;
    }
    try {
      const result = await restoreBackupFile();
      toast.push({
        type: "success",
        title: "备份恢复完成",
        message: `任务 ${result.tasks} · 项目 ${result.projects} · 标签 ${result.tags}`,
      });
    } catch (error) {
      toast.push({ type: "danger", title: "恢复失败", message: errorMessage(error) });
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      toast.push({ type: "warning", title: "请输入 API Key" });
      return;
    }
    try {
      await getAdapters().ai.saveApiKey(apiKey.trim());
      setApiKey("");
      await useSettingsStore.getState().loadSettings();
      toast.push({ type: "success", title: "API Key 已保存" });
    } catch (error) {
      toast.push({ type: "danger", title: "保存失败", message: errorMessage(error) });
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);
    try {
      const result = await getAdapters().ai.testConnection();
      setConnectionStatus(
        `${result.message}${result.latencyMs !== null ? ` · ${result.latencyMs}ms` : ""}`,
      );
      if (!result.ok) {
        toast.push({ type: "warning", title: "AI 连接失败", message: result.message });
      }
    } catch (error) {
      setConnectionStatus(errorMessage(error));
      toast.push({ type: "danger", title: "AI 连接失败", message: errorMessage(error) });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRemindWhenClosed = async (checked: boolean) => {
    try {
      await apply({ remindWhenClosed: checked });
      const message = await getAdapters().reminders.setScheduled(checked);
      toast.push({ type: "success", title: message });
    } catch (error) {
      toast.push({ type: "danger", title: "计划任务设置失败", message: errorMessage(error) });
    }
  };

  const handleTestWebhook = async () => {
    try {
      const message = await getAdapters().reminders.sendTestWebhook();
      toast.push({ type: "success", title: message });
    } catch (error) {
      toast.push({ type: "danger", title: "通知发送失败", message: errorMessage(error) });
    }
  };

  const handlePreviewSound = async () => {
    try {
      await getAdapters().reminders.playSound();
      toast.push({ type: "info", title: "已播放提醒音" });
    } catch (error) {
      toast.push({ type: "danger", title: "播放失败", message: errorMessage(error) });
    }
  };

  return (
    <section className="settings-view" aria-label="设置视图">
      <nav className="settings-nav" aria-label="设置分组">
        {SETTING_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={activeSection === section.id ? "settings-nav__item settings-nav__item--active" : "settings-nav__item"}
            aria-current={activeSection === section.id ? "true" : undefined}
            onClick={() => scrollToSection(section.id)}
          >
            {section.icon}
            <span>{section.label}</span>
          </button>
        ))}
      </nav>

      <div className="settings-content">
        <section id="settings-appearance" className="settings-section">
          <h2>外观</h2>
          <div className="theme-options" role="group" aria-label="主题">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={[
                  "theme-option",
                  (settings?.theme ?? "system") === option.value ? "theme-option--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={(settings?.theme ?? "system") === option.value}
                onClick={() => void apply({ theme: option.value })}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section id="settings-reminders" className="settings-section">
          <h2>提醒</h2>
          <div className="settings-row">
            <div>
              <p className="settings-hint">到期前提醒</p>
            </div>
            <Checkbox
              label="启用提醒"
              checked={settings?.remindersEnabled ?? true}
              onChange={(event) => void apply({ remindersEnabled: event.target.checked })}
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">提前提醒时间</p>
            </div>
            <Select
              label="提前提醒"
              value={String(settings?.remindMinutes ?? 15)}
              onChange={(event) => void apply({ remindMinutes: Number(event.target.value) })}
              options={[
                { value: "5", label: "提前 5 分钟" },
                { value: "15", label: "提前 15 分钟" },
                { value: "30", label: "提前 30 分钟" },
                { value: "60", label: "提前 1 小时" },
              ]}
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">提醒时播放提示音</p>
            </div>
            <div className="settings-inline">
              <Checkbox
                label="启用声音"
                checked={settings?.reminderSoundEnabled ?? true}
                onChange={(event) => void apply({ reminderSoundEnabled: event.target.checked })}
              />
              <Button variant="secondary" onClick={() => void handlePreviewSound()}>
                <Volume2 size={14} />
                试听
              </Button>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">应用完全关闭后仍提醒</p>
              <p className="settings-hint">通过 Windows 计划任务每分钟检查一次</p>
            </div>
            <Checkbox
              label="关闭后提醒"
              checked={settings?.remindWhenClosed ?? true}
              onChange={(event) => void handleRemindWhenClosed(event.target.checked)}
            />
          </div>
        </section>

        <section id="settings-backup" className="settings-section">
          <h2>自动备份</h2>
          <div className="settings-row">
            <div>
              <p className="settings-hint">自动备份数据库文件</p>
            </div>
            <Select
              label="备份频率"
              value={String(settings?.backupIntervalHours ?? 24)}
              onChange={(event) => {
                const value = event.target.value;
                void apply({
                  backupIntervalHours: value ? Number(value) : null,
                });
              }}
              options={[
                { value: "", label: "关闭自动备份" },
                { value: "24", label: "每天" },
                { value: "168", label: "每周" },
                { value: "720", label: "每月" },
              ]}
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">最近备份</p>
              <p className="settings-hint settings-hint--strong">
                {summary?.lastBackupAt
                  ? new Date(summary.lastBackupAt).toLocaleString("zh-CN")
                  : "尚未备份"}
              </p>
            </div>
            <Button variant="secondary" onClick={() => void handleBackup()}>
              <RefreshCw size={14} />
              立即备份
            </Button>
          </div>
          {summary && summary.backups.length > 0 ? (
            <ul className="backup-list">
              {summary.backups.slice(0, 5).map((backup) => (
                <li key={backup.path} className="backup-list__item">
                  <span className="backup-list__name">
                    {backup.path.split(/[\\/]/).pop()}
                  </span>
                  <span>{formatBytes(backup.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section id="settings-notifications" className="settings-section">
          <h2>协作通知</h2>
          <p className="settings-hint">
            配置钉钉、企业微信或飞书机器人 Webhook，到期提醒和 @评论会推送到群里。
          </p>
          <div className="settings-row">
            <div>
              <p className="settings-hint">钉钉机器人</p>
              <p className="settings-hint">
                {settings?.webhookDingTalkConfigured ? "已配置，留空不修改" : "未配置"}
              </p>
            </div>
            <Input
              label="钉钉 Webhook"
              key="dingtalk-webhook"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value) void apply({ webhookDingTalk: value });
              }}
              placeholder={
                settings?.webhookDingTalkConfigured
                  ? "已配置，留空不修改"
                  : "https://oapi.dingtalk.com/robot/send?access_token=..."
              }
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">企业微信机器人</p>
              <p className="settings-hint">
                {settings?.webhookWeComConfigured ? "已配置，留空不修改" : "未配置"}
              </p>
            </div>
            <Input
              label="企微 Webhook"
              key="wecom-webhook"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value) void apply({ webhookWeCom: value });
              }}
              placeholder={
                settings?.webhookWeComConfigured
                  ? "已配置，留空不修改"
                  : "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
              }
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">飞书机器人</p>
              <p className="settings-hint">
                {settings?.webhookFeishuConfigured ? "已配置，留空不修改" : "未配置"}
              </p>
            </div>
            <Input
              label="飞书 Webhook"
              key="feishu-webhook"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value) void apply({ webhookFeishu: value });
              }}
              placeholder={
                settings?.webhookFeishuConfigured
                  ? "已配置，留空不修改"
                  : "https://open.feishu.cn/open-apis/bot/v2/hook/..."
              }
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">向已配置渠道发送测试消息</p>
            </div>
            <Button variant="secondary" onClick={() => void handleTestWebhook()}>
              <Webhook size={14} />
              测试通知
            </Button>
          </div>
        </section>

        <section id="settings-ai" className="settings-section">
          <h2>AI 助手</h2>
          <div className="settings-row">
            <div>
              <p className="settings-hint">提供商</p>
            </div>
            <Select
              label="提供商"
              value={settings?.aiProvider ?? "off"}
              onChange={async (event) => {
                const provider = event.target.value as AiProvider;
                await apply({
                  aiProvider: provider,
                  aiBaseUrl:
                    provider === "local"
                      ? "http://127.0.0.1:11434/v1"
                      : provider === "cloud"
                        ? "https://api.openai.com/v1"
                        : "",
                  aiModel:
                    provider === "local"
                      ? "qwen2.5"
                      : provider === "cloud"
                        ? "gpt-4o-mini"
                        : "",
                });
              }}
              options={[
                { value: "off", label: "未启用" },
                { value: "local", label: "本地模型" },
                { value: "cloud", label: "云端模型" },
              ]}
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">接口地址</p>
            </div>
            <Input
              label="Base URL"
              defaultValue={settings?.aiBaseUrl ?? ""}
              key={settings?.aiBaseUrl ?? "ai-base-url"}
              onBlur={(event) => void apply({ aiBaseUrl: event.target.value.trim() })}
              placeholder="例如：http://127.0.0.1:11434/v1"
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">模型名称</p>
            </div>
            <Input
              label="模型"
              defaultValue={settings?.aiModel ?? ""}
              key={settings?.aiModel ?? "ai-model"}
              onBlur={(event) => void apply({ aiModel: event.target.value.trim() })}
              placeholder="例如：qwen2.5、gpt-4o-mini"
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">温度</p>
            </div>
            <Select
              label="温度"
              value={String(settings?.aiTemperature ?? 0.7)}
              onChange={(event) => void apply({ aiTemperature: Number(event.target.value) })}
              options={[
                { value: "0", label: "精确 0" },
                { value: "0.2", label: "保守 0.2" },
                { value: "0.5", label: "均衡 0.5" },
                { value: "0.7", label: "默认 0.7" },
                { value: "1", label: "灵活 1" },
              ]}
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">允许 AI 使用任务工具</p>
            </div>
            <Checkbox
              label="启用工具"
              checked={settings?.aiToolsEnabled ?? true}
              onChange={(event) => void apply({ aiToolsEnabled: event.target.checked })}
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">删除等操作执行前确认</p>
            </div>
            <Checkbox
              label="需要确认"
              checked={settings?.aiConfirmDestructive ?? true}
              onChange={(event) => void apply({ aiConfirmDestructive: event.target.checked })}
            />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">
                {settings?.aiApiKeyConfigured ? "API Key 已配置" : "云端模型需要 API Key"}
              </p>
            </div>
            <div className="ai-key-row">
              <Input
                label="API Key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={settings?.aiApiKeyConfigured ? "已配置，留空不修改" : "输入 API Key"}
              />
              <Button variant="secondary" onClick={() => void handleSaveApiKey()}>
                <KeyRound size={14} />
                保存
              </Button>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">
                {connectionStatus ?? "测试当前模型连接"}
              </p>
            </div>
            <Button variant="secondary" onClick={() => void handleTestConnection()} disabled={testingConnection}>
              <PlugZap size={14} />
              {testingConnection ? "测试中..." : "测试连接"}
            </Button>
          </div>
          <div className="ai-demo-note">
            <Bot size={14} />
            <span>本地模型支持 Ollama、LM Studio 等 OpenAI 兼容接口</span>
          </div>
        </section>

        <section id="settings-data" className="settings-section">
          <h2>数据与恢复</h2>
          <div className="settings-row">
            <div>
              <p className="settings-hint">数据目录</p>
              <p className="settings-hint settings-hint--strong">
                {summary?.dataDirectory ?? "正在读取..."}
              </p>
            </div>
            <HardDrive size={18} aria-hidden="true" />
          </div>
          <div className="settings-row">
            <div>
              <p className="settings-hint">备份目录</p>
              <p className="settings-hint settings-hint--strong">
                {summary?.backupDirectory ?? "正在读取..."}
              </p>
            </div>
          </div>
          <div className="transfer-actions">
            <Button variant="secondary" onClick={() => void handleExport("json")}>
              <FileJson size={14} />
              导出 JSON
            </Button>
            <Button variant="secondary" onClick={() => void handleExport("csv")}>
              <FileSpreadsheet size={14} />
              导出 CSV
            </Button>
            <Button variant="secondary" onClick={() => void handleExport("excel")}>
              <FileSpreadsheet size={14} />
              导出 Excel
            </Button>
            <Button variant="secondary" onClick={() => void handleImportSpreadsheet("csv")}>
              <Upload size={14} />
              导入 CSV
            </Button>
            <Button variant="secondary" onClick={() => void handleImportSpreadsheet("excel")}>
              <Upload size={14} />
              导入 Excel
            </Button>
            <Button variant="secondary" onClick={() => void handleImportFile()}>
              <Upload size={14} />
              导入文件
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Download size={14} />
              粘贴导入
            </Button>
            <Button variant="secondary" onClick={() => void handleRestoreBackup()}>
              <HardDrive size={14} />
              从备份恢复
            </Button>
          </div>
          <div className="recovery-guide">
            <p className="settings-hint">
              恢复指引：在设置页点击“从备份恢复”，选择备份目录中最新的 .zip 备份文件，
              即可恢复任务、项目、素材库和附件。
            </p>
          </div>
        </section>

        <section id="settings-entities" className="settings-section">
          <h2>项目与标签</h2>
          <div className="entity-grid">
            <div>
              <h3 className="entity-heading">项目</h3>
              <ProjectManager />
            </div>
            <div>
              <h3 className="entity-heading">标签</h3>
              <TagManager />
            </div>
          </div>
        </section>

        <section id="settings-templates" className="settings-section">
          <h2>任务模板</h2>
          <p className="settings-hint">
            在新建任务编辑页或任务详情中，可以把主任务保存为模板。
          </p>
          {templates.length === 0 ? (
            <p className="settings-hint settings-hint--strong">暂无模板</p>
          ) : (
            <ul className="template-manager-list">
              {templates.map((template) => {
                const main = template.tasks[0];
                return (
                  <li key={template.id} className="template-manager-item">
                    <span className="template-manager-item__name">{template.name}</span>
                    <span className="template-manager-item__meta">
                      {((main.children ?? []).length) > 0 ? `${(main.children ?? []).length} 个大任务` : "无拆解"}
                    </span>
                    <IconButton
                      size="sm"
                      label={`删除模板 ${template.name}`}
                      onClick={() => void deleteTemplate(template.id)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="粘贴 JSON 导入"
        description="粘贴导出的 JSON 备份内容。合并模式保留现有数据，覆盖模式会替换任务、项目与标签。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleImportText()}>导入</Button>
          </>
        }
      >
        <div className="import-form">
          <Checkbox
            label="覆盖现有数据（合并模式默认关闭）"
            checked={replaceMode}
            onChange={(event) => setReplaceMode(event.target.checked)}
          />
          <Textarea
            label="JSON 内容"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder='{"schemaVersion":1,"projects":[],"tags":[],"tasks":[]}'
            rows={14}
          />
        </div>
      </Modal>
    </section>
  );
}
