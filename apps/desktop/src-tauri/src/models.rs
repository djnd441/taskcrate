use chrono::{SecondsFormat, Utc};
use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

pub fn default_repeat_interval() -> i64 {
    1
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    #[default]
    Todo,
    InProgress,
    Completed,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
        }
    }
}

impl FromStr for TaskStatus {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "todo" => Ok(Self::Todo),
            "in_progress" => Ok(Self::InProgress),
            "completed" => Ok(Self::Completed),
            "cancelled" => Ok(Self::Cancelled),
            other => Err(format!("未知任务状态：{other}")),
        }
    }
}

impl ToSql for TaskStatus {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for TaskStatus {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value
            .as_str()
            .and_then(|s| s.parse().map_err(|_| FromSqlError::InvalidType))
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    #[default]
    None,
    Low,
    Medium,
    High,
    Urgent,
}

impl Priority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Urgent => "urgent",
        }
    }
}

impl FromStr for Priority {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "none" => Ok(Self::None),
            "low" => Ok(Self::Low),
            "medium" => Ok(Self::Medium),
            "high" => Ok(Self::High),
            "urgent" => Ok(Self::Urgent),
            other => Err(format!("未知优先级：{other}")),
        }
    }
}

impl ToSql for Priority {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for Priority {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value
            .as_str()
            .and_then(|s| s.parse().map_err(|_| FromSqlError::InvalidType))
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    #[default]
    Main,
    Major,
    Minor,
}

impl TaskKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Major => "major",
            Self::Minor => "minor",
        }
    }
}

impl FromStr for TaskKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "main" => Ok(Self::Main),
            "major" => Ok(Self::Major),
            "minor" => Ok(Self::Minor),
            other => Err(format!("未知任务层级：{other}")),
        }
    }
}

impl ToSql for TaskKind {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for TaskKind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value
            .as_str()
            .and_then(|s| s.parse().map_err(|_| FromSqlError::InvalidType))
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceKind {
    #[default]
    Tool,
    Material,
    People,
    Budget,
    Other,
}

impl ResourceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tool => "tool",
            Self::Material => "material",
            Self::People => "people",
            Self::Budget => "budget",
            Self::Other => "other",
        }
    }
}

impl FromStr for ResourceKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "tool" => Ok(Self::Tool),
            "material" => Ok(Self::Material),
            "people" => Ok(Self::People),
            "budget" => Ok(Self::Budget),
            "other" => Ok(Self::Other),
            other => Err(format!("未知资源类型：{other}")),
        }
    }
}

impl ToSql for ResourceKind {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for ResourceKind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value
            .as_str()
            .and_then(|s| s.parse().map_err(|_| FromSqlError::InvalidType))
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceStatus {
    #[default]
    Pending,
    Ready,
    InUse,
    Done,
}

impl ResourceStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Ready => "ready",
            Self::InUse => "in_use",
            Self::Done => "done",
        }
    }
}

impl FromStr for ResourceStatus {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "pending" => Ok(Self::Pending),
            "ready" => Ok(Self::Ready),
            "in_use" => Ok(Self::InUse),
            "done" => Ok(Self::Done),
            other => Err(format!("未知资源状态：{other}")),
        }
    }
}

impl ToSql for ResourceStatus {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for ResourceStatus {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value
            .as_str()
            .and_then(|s| s.parse().map_err(|_| FromSqlError::InvalidType))
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    #[default]
    Off,
    Local,
    Cloud,
}

impl AiProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Local => "local",
            Self::Cloud => "cloud",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepeatFrequency {
    #[default]
    None,
    Daily,
    Weekly,
    Monthly,
    Custom,
}

impl RepeatFrequency {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
            Self::Custom => "custom",
        }
    }
}

impl FromStr for RepeatFrequency {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "none" => Ok(Self::None),
            "daily" => Ok(Self::Daily),
            "weekly" => Ok(Self::Weekly),
            "monthly" => Ok(Self::Monthly),
            "custom" => Ok(Self::Custom),
            other => Err(format!("未知重复频率：{other}")),
        }
    }
}

impl ToSql for RepeatFrequency {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.as_str()))
    }
}

impl FromSql for RepeatFrequency {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value
            .as_str()
            .and_then(|s| s.parse().map_err(|_| FromSqlError::InvalidType))
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub due_at: Option<String>,
    #[serde(default)]
    pub repeat_frequency: RepeatFrequency,
    #[serde(default = "default_repeat_interval")]
    pub repeat_interval: i64,
    #[serde(default)]
    pub repeat_end_at: Option<String>,
    #[serde(default)]
    pub assignee: Option<String>,
    #[serde(default)]
    pub department: Option<String>,
    #[serde(default)]
    pub start_at: Option<String>,
    #[serde(default)]
    pub done_criteria: Option<String>,
    #[serde(default)]
    pub budget: Option<String>,
    pub priority: Priority,
    pub status: TaskStatus,
    pub project_id: Option<String>,
    pub tag_ids: Vec<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub task_kind: TaskKind,
    #[serde(default)]
    pub resources: Vec<TaskResource>,
    pub sort_order: i64,
    pub archived_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub deleted_at: Option<String>,
    pub schema_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResource {
    pub id: String,
    pub name: String,
    pub kind: ResourceKind,
    pub quantity: String,
    pub unit: String,
    pub status: ResourceStatus,
    pub notes: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResourceInput {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub kind: ResourceKind,
    #[serde(default)]
    pub quantity: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub status: ResourceStatus,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub sort_order: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCreateInput {
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default)]
    pub repeat_frequency: RepeatFrequency,
    #[serde(default = "default_repeat_interval")]
    pub repeat_interval: i64,
    #[serde(default)]
    pub repeat_end_at: Option<String>,
    #[serde(default)]
    pub assignee: Option<String>,
    #[serde(default)]
    pub department: Option<String>,
    #[serde(default)]
    pub start_at: Option<String>,
    #[serde(default)]
    pub done_criteria: Option<String>,
    #[serde(default)]
    pub budget: Option<String>,
    #[serde(default)]
    pub priority: Priority,
    #[serde(default)]
    pub status: TaskStatus,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub tag_ids: Vec<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub task_kind: TaskKind,
    #[serde(default)]
    pub resources: Vec<TaskResourceInput>,
    #[serde(default)]
    pub children: Vec<TaskCreateInput>,
    #[serde(default)]
    pub sort_order: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdateInput {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub due_at: Option<Option<String>>,
    #[serde(default)]
    pub repeat_frequency: Option<RepeatFrequency>,
    #[serde(default)]
    pub repeat_interval: Option<i64>,
    #[serde(default)]
    pub repeat_end_at: Option<Option<String>>,
    #[serde(default)]
    pub assignee: Option<Option<String>>,
    #[serde(default)]
    pub department: Option<Option<String>>,
    #[serde(default)]
    pub start_at: Option<Option<String>>,
    #[serde(default)]
    pub done_criteria: Option<Option<String>>,
    #[serde(default)]
    pub budget: Option<Option<String>>,
    pub priority: Option<Priority>,
    pub project_id: Option<Option<String>>,
    pub tag_ids: Option<Vec<String>>,
    #[serde(default)]
    pub parent_id: Option<Option<String>>,
    #[serde(default)]
    pub task_kind: Option<TaskKind>,
    #[serde(default)]
    pub resources: Option<Vec<TaskResourceInput>>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct TaskFilter {
    pub query: Option<String>,
    pub statuses: Option<Vec<TaskStatus>>,
    pub priorities: Option<Vec<Priority>>,
    pub project_id: Option<Option<String>>,
    pub tag_ids: Option<Vec<String>>,
    pub due_from: Option<String>,
    pub due_until: Option<String>,
    pub include_archived: bool,
    pub include_deleted: bool,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskSortField {
    #[default]
    CreatedAt,
    UpdatedAt,
    DueAt,
    Priority,
    SortOrder,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskSortDirection {
    #[default]
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSort {
    pub field: TaskSortField,
    pub direction: TaskSortDirection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPage {
    pub items: Vec<Task>,
    pub total: i64,
    pub offset: i64,
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i64,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreateInput {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub sort_order: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUpdateInput {
    pub name: Option<String>,
    pub color: Option<Option<String>>,
    pub sort_order: Option<i64>,
    pub is_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCreateInput {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagUpdateInput {
    pub name: Option<String>,
    pub color: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: ThemeMode,
    pub language: String,
    pub reminders_enabled: bool,
    pub remind_minutes: i64,
    pub reminder_sound_enabled: bool,
    pub remind_when_closed: bool,
    pub backup_interval_hours: Option<i64>,
    pub data_directory: Option<String>,
    pub last_backup_at: Option<String>,
    pub ai_provider: AiProvider,
    pub ai_base_url: String,
    pub ai_model: String,
    pub ai_temperature: f64,
    pub ai_tools_enabled: bool,
    pub ai_confirm_destructive: bool,
    pub ai_api_key_configured: bool,
    pub webhook_ding_talk: String,
    pub webhook_we_com: String,
    pub webhook_feishu: String,
    #[serde(default)]
    pub webhook_ding_talk_configured: bool,
    #[serde(default)]
    pub webhook_we_com_configured: bool,
    #[serde(default)]
    pub webhook_feishu_configured: bool,
    pub schema_version: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub theme: Option<ThemeMode>,
    pub language: Option<String>,
    pub reminders_enabled: Option<bool>,
    pub remind_minutes: Option<i64>,
    pub reminder_sound_enabled: Option<bool>,
    pub remind_when_closed: Option<bool>,
    pub backup_interval_hours: Option<Option<i64>>,
    pub data_directory: Option<Option<String>>,
    pub last_backup_at: Option<Option<String>>,
    pub ai_provider: Option<AiProvider>,
    pub ai_base_url: Option<String>,
    pub ai_model: Option<String>,
    pub ai_temperature: Option<f64>,
    pub ai_tools_enabled: Option<bool>,
    pub ai_confirm_destructive: Option<bool>,
    #[serde(default)]
    pub webhook_ding_talk: Option<String>,
    #[serde(default)]
    pub webhook_we_com: Option<String>,
    #[serde(default)]
    pub webhook_feishu: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatMessage {
    pub role: String,
    pub content: Option<String>,
    #[serde(default)]
    pub tool_call_id: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<AiToolCall>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResult {
    pub text: Option<String>,
    pub tool_calls: Vec<AiToolCall>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConnectionResult {
    pub ok: bool,
    pub latency_ms: Option<u64>,
    pub model: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConversation {
    pub id: String,
    pub title: String,
    pub provider: AiProvider,
    pub model: String,
    pub messages: Vec<AiChatMessage>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConversationSummary {
    pub id: String,
    pub title: String,
    pub provider: AiProvider,
    pub model: String,
    pub message_count: usize,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskAttachment {
    pub id: String,
    pub task_id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryResource {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub kind: String,
    pub size_bytes: u64,
    pub storage_path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplate {
    pub id: String,
    pub name: String,
    pub project_id: Option<String>,
    pub tasks: Vec<TaskCreateInput>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplateInput {
    pub name: String,
    #[serde(default)]
    pub project_id: Option<String>,
    pub tasks: Vec<TaskCreateInput>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageResult {
    pub path: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthInfo {
    pub name: String,
    pub version: String,
    pub schema_version: i64,
    pub data_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLog {
    pub id: String,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub summary: String,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub update_url: Option<String>,
    pub release_url: Option<String>,
    pub release_name: Option<String>,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
    pub checked_at: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskComment {
    pub id: String,
    pub task_id: String,
    pub author: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCommentInput {
    pub task_id: String,
    pub author: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMember {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemberInput {
    pub project_id: String,
    pub name: String,
    pub email: String,
    pub role: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub data_directory: String,
    pub backup_directory: String,
    pub last_backup_at: Option<String>,
    pub backups: Vec<BackupInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub projects: usize,
    pub tags: usize,
    pub tasks: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub count: usize,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPayload {
    pub schema_version: i64,
    pub exported_at: String,
    pub projects: Vec<Project>,
    pub tags: Vec<Tag>,
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub settings: Option<Settings>,
    #[serde(default)]
    pub templates: Vec<TaskTemplate>,
    #[serde(default)]
    pub comments: Vec<TaskComment>,
    #[serde(default)]
    pub members: Vec<ProjectMember>,
    #[serde(default)]
    pub library_resources: Vec<LibraryResource>,
    #[serde(default)]
    pub attachments: Vec<TaskAttachment>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_filter_missing_archive_flags_default_to_false() {
        let filter: TaskFilter = serde_json::from_str("{}").expect("filter should parse");
        assert!(!filter.include_archived);
        assert!(!filter.include_deleted);
    }
}
