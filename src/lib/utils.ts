import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Coupon } from './webdav-storage';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 获取剩余小时数（精确到小时，允许负数表示已过期）
 * 统一使用北京时间（UTC+8）计算
 * 
 * 计算方式：endDate（日期） + endHour:endMinute（时间）
 */
export function getRemainingHours(coupon: Coupon): number {
  const now = new Date();
  const nowTimestamp = now.getTime();

  // 获取截止时间的小时和分钟
  const endHour = coupon.endHour ?? 23;
  const endMinute = coupon.endMinute ?? 59;
  const endSecond = 59;

  // endDate 只存储日期（YYYY-MM-DD），需要组合 endHour:endMinute
  const endDateStr = coupon.endDate;
  
  // 提取日期部分（处理可能带时间的格式）
  let datePart: string;
  if (endDateStr.includes('T')) {
    datePart = endDateStr.split('T')[0];
  } else {
    datePart = endDateStr;
  }

  const [year, month, day] = datePart.split('-').map(Number);
  
  // 创建本地时间对象（北京时间），组合日期和时间
  const endDate = new Date(year, month - 1, day, endHour, endMinute, endSecond);
  const endDateTimestamp = endDate.getTime();

  // 计算剩余毫秒数
  const diffMs = endDateTimestamp - nowTimestamp;
  // 转换为小时，使用 Math.floor 向下取整，允许负数
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

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
