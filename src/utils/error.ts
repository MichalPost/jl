/**
 * Rust AppError 错误类型映射
 * 与 src-tauri/src/error.rs 中的 AppError 变体对应
 */
const ERROR_TYPE_MESSAGES: Record<string, string> = {
  Io: "文件读写失败",
  Serialize: "数据格式错误",
  Clipboard: "剪贴板访问失败",
  Ocr: "文字识别失败",
  AiApi: "AI 服务暂时不可用",
  Plugin: "插件加载失败",
  Window: "窗口操作失败",
  Shortcut: "快捷键注册失败",
  Storage: "存储访问失败",
  NotFound: "内容不存在",
  InvalidInput: "输入内容无效",
}

/**
 * 将 Tauri 命令返回的错误转换为用户友好的提示文案
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  // Tauri 命令错误：{ type: string, message: string }
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>
    if (typeof err.type === "string" && typeof err.message === "string") {
      const friendlyType = ERROR_TYPE_MESSAGES[err.type]
      return friendlyType ? `${friendlyType}：${err.message}` : err.message
    }
    // 兼容旧格式：直接字符串错误
    if (typeof err.message === "string") {
      return err.message
    }
  }

  if (typeof error === "string") {
    return error
  }

  return "发生未知错误"
}
