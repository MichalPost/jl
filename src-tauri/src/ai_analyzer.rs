use crate::error::AppError;

#[tauri::command]
pub fn analyze_intent(text: String) -> Result<serde_json::Value, AppError> {
    Ok(serde_json::json!({
        "intent": "general",
        "confidence": 0.5,
        "suggestion": format!("已接收文本：{}", text.chars().take(30).collect::<String>()),
    }))
}
