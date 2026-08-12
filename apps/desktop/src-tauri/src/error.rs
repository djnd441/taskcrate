use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("数据库错误：{0}")]
    Database(#[from] rusqlite::Error),
    #[error("数据校验失败：{0}")]
    Validation(String),
    #[error("任务不存在：{0}")]
    TaskNotFound(String),
    #[error("项目不存在：{0}")]
    ProjectNotFound(String),
    #[error("标签不存在：{0}")]
    TagNotFound(String),
    #[error("任务模板不存在：{0}")]
    TaskTemplateNotFound(String),
    #[error("非法状态流转：{0}")]
    InvalidTransition(String),
    #[error("当前状态不允许该操作：{0}")]
    InvalidState(String),
    #[error("文件操作失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("导入失败：{0}")]
    Import(String),
    #[error("备份失败：{0}")]
    Backup(String),
    #[error("密钥存储失败：{0}")]
    Secrets(String),
}
