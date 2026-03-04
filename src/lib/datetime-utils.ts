/**
 * 日期时间工具函数（基于北京时间 UTC+8）
 */

/**
 * 安全地创建Date对象（使用本地时间，避免时区问题）
 * @param dateStr 日期字符串或undefined
 * @returns Date对象
 */
export function safeCreateDate(dateStr: string | undefined): Date {
  if (!dateStr) {
    return new Date()
  }

  // 如果日期格式是 YYYY-MM-DD，使用本地时间解析（避免UTC时区问题）
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(dateStr)
}

/**
 * 根据年月日时分秒创建Date对象（基于本地时间）
 * @param year 年
 * @param month 月（1-12）
 * @param day 日
 * @param hour 小时（0-23）
 * @param minute 分钟（0-59）
 * @param second 秒（0-59）
 * @param millisecond 毫秒（0-999）
 * @returns Date对象
 */
export function createLocalDate(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
  millisecond: number = 0
): Date {
  return new Date(year, month - 1, day, hour, minute, second, millisecond)
}

/**
 * 根据Date对象和指定的时分创建新的Date对象（基于本地时间）
 * @param date 原始Date对象
 * @param hour 小时（0-23）
 * @param minute 分钟（0-59）
 * @param second 秒（0-59）
 * @param millisecond 毫秒（0-999）
 * @returns 新的Date对象
 */
export function setLocalTime(
  date: Date,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
  millisecond: number = 0
): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    second,
    millisecond
  )
}

/**
 * 将Date对象转换为ISO字符串（YYYY-MM-DDTHH:mm:ss.sssZ）
 * 使用本地时间，不转换为UTC
 * @param date Date对象
 * @returns ISO格式字符串
 */
export function toLocalISOString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+08:00`
}

/**
 * 格式化日期为 YYYY-MM-DD 格式（基于本地时间）
 * @param date Date对象或日期字符串
 * @returns YYYY-MM-DD格式字符串
 */
export function formatLocalDate(date: Date | string): string {
  const d = typeof date === 'string' ? safeCreateDate(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 北京时间现在是几点
 * @returns 当前北京时间Date对象
 */
export function getBeijingTime(): Date {
  return new Date()
}
