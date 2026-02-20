import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Coupon } from './webdav-storage';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 获取剩余小时数（精确到小时，允许负数表示已过期）
 * 统一使用北京时间（UTC+8）计算
 */
export function getRemainingHours(coupon: Coupon): number {
  const now = new Date();
  const nowTimestamp = now.getTime();

  // 获取截止时间的小时和分钟（北京时间）
  const endHour = coupon.endHour ?? 23;
  const endMinute = 59;
  const endSecond = 59;

  let endDateTimestamp: number;

  // 处理不同的日期格式
  if (coupon.endDate.includes('T') && coupon.endDate.endsWith('Z')) {
    // 带Z后缀，表示UTC时间，直接解析
    const utcDate = new Date(coupon.endDate);
    endDateTimestamp = utcDate.getTime();
    console.log(`优惠券 "${coupon.title}": UTC日期 ${coupon.endDate}, 时间戳: ${endDateTimestamp}`);
  } else if (coupon.endDate.includes('T')) {
    // 带T但不带Z，假设为本地时间（北京时间），手动解析
    const [datePart, timePart] = coupon.endDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const timeComponents = (timePart || '00:00:00').split(':');
    const hour = Number(timeComponents[0]);
    const minute = Number(timeComponents[1] || 0);
    const second = Number(timeComponents[2] || 0);

    // 创建本地时间对象（北京时间）
    const localDate = new Date(year, month - 1, day, hour, minute, second);
    endDateTimestamp = localDate.getTime();
    console.log(`优惠券 "${coupon.title}": 本地日期 ${coupon.endDate}, 时间戳: ${endDateTimestamp}`);
  } else {
    // 纯日期格式（如 2026-02-23），假设为北京时间
    // 注意：必须使用手动解析方式，不能直接使用 new Date("2026-02-23")
    // 因为在某些环境下会解析为08:00而不是00:00
    const [year, month, day] = coupon.endDate.split('-').map(Number);
    // 创建本地时间对象（北京时间），使用 endHour:endMinute:59
    const localDate = new Date(year, month - 1, day, endHour, endMinute, endSecond);
    endDateTimestamp = localDate.getTime();
    console.log(`优惠券 "${coupon.title}": 纯日期 ${coupon.endDate}, 设置为 ${endHour}:${endMinute}:59, 时间戳: ${endDateTimestamp}`);
  }

  // 计算剩余毫秒数
  const diffMs = endDateTimestamp - nowTimestamp;
  // 转换为小时，使用 Math.floor 向下取整，允许负数
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  console.log(`优惠券 "${coupon.title}": 剩余 ${hours} 小时`);

  return hours;
}

/**
 * 检查优惠券是否在指定的天数范围内提醒
 * @param coupon 优惠券
 * @param days 提醒天数（如 7 表示7天内）
 * @returns 是否应该提醒
 */
export function isRemindWithinDays(coupon: Coupon, days: number): boolean {
  // 只排除已使用的优惠券
  if (coupon.isUsed) {
    return false;
  }

  // 注意：不再检查 isReminded 字段，允许重复提醒
  // 每次推送都应该检查即将到期的优惠券

  const remainingHours = getRemainingHours(coupon);
  // 将天数转换为小时，严格小于指定天数的小时数
  return remainingHours >= 0 && remainingHours < days * 24;
}
