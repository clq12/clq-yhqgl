/**
 * datetime-utils.ts
 * 全项目统一时间工具（固定为北京时间 UTC+8）
 */

const BEIJING_OFFSET_MINUTES = 8 * 60
const BEIJING_OFFSET_MS = BEIJING_OFFSET_MINUTES * 60 * 1000

/**
 * 获取当前北京时间 Date 对象
 */
export function getBeijingNow(): Date {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() + offset + BEIJING_OFFSET_MS)
}

/**
 * 将任意 Date 转换为北京时间 Date
 */
export function toBeijingDate(date: Date): Date {
  const offset = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() + offset + BEIJING_OFFSET_MS)
}

/**
 * 安全创建 Date
 */
export function safeCreateDate(input: any): Date | null {
  if (!input) return null

  if (input instanceof Date) {
    return toBeijingDate(input)
  }

  const d = new Date(input)

  if (isNaN(d.getTime())) return null

  return toBeijingDate(d)
}

/**
 * 生成北京时间 ISO 字符串
 * 格式: YYYY-MM-DDTHH:mm:ss.SSS+08:00
 */
export function toLocalISOString(date: Date): string {
  const bj = toBeijingDate(date)

  const year = bj.getFullYear()
  const month = String(bj.getMonth() + 1).padStart(2, "0")
  const day = String(bj.getDate()).padStart(2, "0")

  const hours = String(bj.getHours()).padStart(2, "0")
  const minutes = String(bj.getMinutes()).padStart(2, "0")
  const seconds = String(bj.getSeconds()).padStart(2, "0")
  const ms = String(bj.getMilliseconds()).padStart(3, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}+08:00`
}

/**
 * 生成 YYYY-MM-DD
 */
export function formatLocalDate(date: Date): string {
  const bj = toBeijingDate(date)

  const year = bj.getFullYear()
  const month = String(bj.getMonth() + 1).padStart(2, "0")
  const day = String(bj.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

/**
 * 设置日期时间（保持北京时间）
 */
export function setLocalTime(
  date: Date,
  hour: number,
  minute: number,
  second: number = 0,
  ms: number = 0
): Date {
  const bj = toBeijingDate(date)

  bj.setHours(hour)
  bj.setMinutes(minute)
  bj.setSeconds(second)
  bj.setMilliseconds(ms)

  return bj
}

/**
 * 计算两个日期相差天数
 */
export function diffDays(date1: Date, date2: Date): number {
  const bj1 = toBeijingDate(date1)
  const bj2 = toBeijingDate(date2)

  const d1 = new Date(bj1.getFullYear(), bj1.getMonth(), bj1.getDate())
  const d2 = new Date(bj2.getFullYear(), bj2.getMonth(), bj2.getDate())

  const diff = d2.getTime() - d1.getTime()

  return Math.floor(diff / (24 * 60 * 60 * 1000))
}

/**
 * 是否同一天
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  const bj1 = toBeijingDate(date1)
  const bj2 = toBeijingDate(date2)

  return (
    bj1.getFullYear() === bj2.getFullYear() &&
    bj1.getMonth() === bj2.getMonth() &&
    bj1.getDate() === bj2.getDate()
  )
}

/**
 * 今天 YYYY-MM-DD
 */
export function today(): string {
  return formatLocalDate(getBeijingNow())
}