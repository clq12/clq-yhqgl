/**
 * datetime-utils.ts
 * 全项目统一时间工具（固定为北京时间 UTC+8）
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000 // 8小时的毫秒数

/**
 * 获取当前北京时间 Date 对象
 * 不依赖系统时区，直接基于 UTC 时间计算
 */
export function getBeijingNow(): Date {
  const now = new Date()
  // 获取 UTC 时间戳，然后加 8 小时
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000
  return new Date(utcTime + BEIJING_OFFSET_MS)
}

/**
 * 将任意 Date 转换为北京时间 Date
 * 不依赖系统时区，直接基于 UTC 时间计算
 */
export function toBeijingDate(date: Date): Date {
  // 获取 UTC 时间戳，然后加 8 小时
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60 * 1000
  return new Date(utcTime + BEIJING_OFFSET_MS)
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
 * 格式: YYYY-MM-DDTHH:mm:ss.SSS（不带时区后缀）
 * 不依赖系统时区，直接基于 UTC 时间计算
 */
export function toLocalISOString(date: Date): string {
  // 获取 UTC 时间
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60 * 1000
  // 加 8 小时得到北京时间
  const beijingTime = new Date(utcTime + BEIJING_OFFSET_MS)

  const year = beijingTime.getFullYear()
  const month = String(beijingTime.getMonth() + 1).padStart(2, "0")
  const day = String(beijingTime.getDate()).padStart(2, "0")

  const hours = String(beijingTime.getHours()).padStart(2, "0")
  const minutes = String(beijingTime.getMinutes()).padStart(2, "0")
  const seconds = String(beijingTime.getSeconds()).padStart(2, "0")
  const ms = String(beijingTime.getMilliseconds()).padStart(3, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`
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