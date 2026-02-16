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
  // 转换为北京时间
  const nowBeijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  let endDate: Date;

  // 处理不同的日期格式
  if (coupon.endDate.includes('T') && !coupon.endDate.endsWith('Z')) {
    // 带T但不带Z的ISO日期，假设为北京时间
    const [datePart, timePart] = coupon.endDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = (timePart || '23:59').split(':').map(Number);
    endDate = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
  } else {
    // 标准ISO字符串（带Z）或其他格式，直接解析
    const parsedDate = new Date(coupon.endDate);

    // 设置小时
    const hours = coupon.endHour ?? 23;
    parsedDate.setHours(hours, 59, 59, 999);

    // 如果带Z后缀，已经是UTC时间；否则假设为北京时间，转换为UTC
    if (coupon.endDate.endsWith('Z')) {
      endDate = parsedDate;
    } else {
      endDate = new Date(parsedDate.getTime() + 8 * 60 * 60 * 1000);
    }
  }

  // 计算剩余毫秒数
  const diffMs = endDate.getTime() - nowBeijing.getTime();
  // 转换为小时，使用 Math.floor 向下取整，允许负数
  return Math.floor(diffMs / (1000 * 60 * 60));
}

/**
 * 检查优惠券是否在指定的天数范围内提醒
 * @param coupon 优惠券
 * @param days 提醒天数（如 7 表示7天内）
 * @returns 是否应该提醒
 */
export function isRemindWithinDays(coupon: Coupon, days: number): boolean {
  if (coupon.isUsed || coupon.isReminded) {
    return false;
  }

  const remainingHours = getRemainingHours(coupon);
  // 将天数转换为小时，严格小于指定天数的小时数
  return remainingHours >= 0 && remainingHours < days * 24;
}
