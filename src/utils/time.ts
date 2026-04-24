import { format, formatDistanceToNowStrict } from "date-fns"
import { zhCN } from "date-fns/locale"

export function formatItemTime(value: string) {
  return format(new Date(value), "yyyy-MM-dd HH:mm")
}

export function formatRelativeTime(value: string) {
  return formatDistanceToNowStrict(new Date(value), {
    addSuffix: true,
    locale: zhCN,
  })
}
