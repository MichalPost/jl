use serde::Serialize;
use thiserror::Error;

/// 统一错误类型，覆盖应用所有错误场景
#[derive(Debug, Error, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    /// 文件系统 I/O 错误
    #[error("IO error: {0}")]
    Io(String),

    /// JSON 序列化/反序列化错误
    #[error("Serialization error: {0}")]
    Serialize(String),

    /// 剪贴板读写错误
    #[error("Clipboard error: {0}")]
    Clipboard(String),

    /// OCR 识别错误
    #[error("OCR error: {0}")]
    Ocr(String),

    /// AI API 请求错误
    #[error("AI API error: {0}")]
    AiApi(String),

    /// 插件加载或执行错误
    #[error("Plugin error: {0}")]
    Plugin(String),

    /// 窗口管理错误
    #[error("Window error: {0}")]
    Window(String),

    /// 快捷键注册错误
    #[error("Shortcut error: {0}")]
    Shortcut(String),

    /// 存储层错误（文件损坏、权限不足等）
    #[error("Storage error: {0}")]
    Storage(String),

    /// 资源未找到错误
    #[error("Not found: {0}")]
    NotFound(String),

    /// 无效输入错误
    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serialize(value.to_string())
    }
}

/// 记录可恢复错误，不中断主流程
pub fn log_error(error: &AppError) {
    eprintln!("[AppError] {}", error);
}
