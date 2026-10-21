/**
 * 优惠券业务规则（TypeScript 实现）
 * 与 shared/rules/coupon-rules.md 保持一致
 */

import type { Coupon } from './coupon';

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 当前北京时间 Date
 */
export function beijingNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utc + BEIJING_OFFSET_MS);
}

/**
 * 优惠券截止时间（UTC 时间戳，毫秒）
 */
export function deadlineTimestamp(coupon: Coupon): number {
  const hour = coupon.endHour ?? 23;
  const minute = coupon.endMinute ?? 59;
  // 构造北京时间
  const beijing = new Date(`${coupon.endDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:59.000+08:00`);
  return beijing.getTime();
}

/**
 * 剩余小时数
 */
export function remainingHours(coupon: Coupon, nowMs: number = Date.now()): number {
  return Math.floor((deadlineTimestamp(coupon) - nowMs) / (1000 * 60 * 60));
}

/**
 * 剩余天数
 */
export function remainingDays(coupon: Coupon, nowMs: number = Date.now()): number {
  return Math.floor(remainingHours(coupon, nowMs) / 24);
}

/**
 * 是否已过期
 */
export function isExpired(coupon: Coupon, nowMs: number = Date.now()): boolean {
  return remainingHours(coupon, nowMs) < 0;
}

/**
 * 是否有效
 */
export function isActive(coupon: Coupon, nowMs: number = Date.now()): boolean {
  return !coupon.isUsed && !isExpired(coupon, nowMs);
}

/**
 * 是否应在指定天数内提醒
 */
export function shouldRemindWithinDays(
  coupon: Coupon,
  days: number,
  nowMs: number = Date.now(),
): boolean {
  if (coupon.isUsed) return false;
  const hours = remainingHours(coupon, nowMs);
  return hours >= 0 && hours < days * 24;
}

/**
 * 当前应提醒的天数（0 表示无需提醒）
 */
export function currentRemindDays(
  coupon: Coupon,
  remindDays: number[],
  nowMs: number = Date.now(),
): number {
  for (const days of [...remindDays].sort((a, b) => b - a)) {
    if (shouldRemindWithinDays(coupon, days, nowMs) && !coupon.remindedDays.includes(days)) {
      return days;
    }
  }
  return 0;
}

/**
 * 验证优惠券
 */
export function validateCoupon(coupon: Coupon): { ok: true } | { ok: false; error: string } {
  if (!coupon.title || coupon.title.length > 255) {
    return { ok: false, error: '标题不能为空且长度不超过255' };
  }
  if (coupon.endDate < coupon.startDate) {
    return { ok: false, error: '截止日期不能早于开始日期' };
  }
  const hour = coupon.endHour ?? 23;
  const minute = coupon.endMinute ?? 59;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { ok: false, error: '截止时间时分不合法' };
  }
  if (coupon.discountType === 'full') {
    if ((coupon.fullAmount ?? 0) <= 0 || (coupon.discountAmount ?? 0) <= 0) {
      return { ok: false, error: '满减优惠必须填写满金额和减免金额' };
    }
  }
  if ((coupon.discountType === 'amount' || coupon.discountType === 'percentage') && (coupon.discountAmount ?? 0) <= 0) {
    return { ok: false, error: '折扣金额必须大于0' };
  }
  return { ok: true };
}

/**
 * 优惠力度的展示文案。
 *
 * 两端必须一模一样，所以放在共享规则里 —— 安卓和网页各自算会导致
 * 同一张券在手机和电脑上显示成两种说法。
 */
export function discountLabel(coupon: Coupon): string {
  switch (coupon.discountType) {
    case 'amount':
      return `减 ¥${formatAmount(coupon.discountAmount ?? 0)}`;
    case 'percentage':
      return `${formatAmount(coupon.discountAmount ?? 0)} 折`;
    case 'full':
      return `满 ¥${formatAmount(coupon.fullAmount ?? 0)} 减 ¥${formatAmount(coupon.discountAmount ?? 0)}`;
    case 'group':
      return '团购券';
    default:
      return '无门槛';
  }
}

/** 金额展示：整数不带小数点，其余最多两位 */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface StatusLabel {
  tone: StatusTone;
  text: string;
}

/** 状态标签，与 Android CouponRules.statusLabel 一致 */
export function statusLabel(coupon: Coupon, nowMs: number = Date.now()): StatusLabel {
  if (coupon.isUsed) return { tone: 'neutral', text: '已使用' };
  if (isExpired(coupon, nowMs)) return { tone: 'danger', text: '已过期' };
  const days = remainingDays(coupon, nowMs);
  if (days <= 3) return { tone: 'warning', text: `仅剩 ${days} 天` };
  return { tone: 'success', text: `剩余 ${days} 天` };
}

/**
 * 从标题提取店铺名
 */
export function extractStore(title: string): string {
  const commonStores = [
    '淘宝', '天猫', '京东', '拼多多', '美团', '饿了么', '盒马', '山姆', 'Costco',
    '永辉', '大润发', '家乐福', '沃尔玛', '优衣库', 'ZARA', 'H&M', 'Nike', 'Adidas',
    '星巴克', '喜茶', '奈雪', '瑞幸', '肯德基', '麦当劳', '海底捞', '小龙坎',
    '蜜雪冰城', '云闪付', '一鸣', '古茗', '立减金', '小蚕', '库迪'
  ];
  for (const store of commonStores) {
    if (title.includes(store)) return store;
  }
  const idx = title.indexOf(' ');
  if (idx > 0) return title.slice(0, idx);
  return title.trim() || '其他';
}

/**
 * 按店铺统计
 */
export function groupByStore(coupons: Coupon[]) {
  const map = new Map<string, { amount: number; count: number; usedCount: number }>();
  for (const c of coupons) {
    const store = extractStore(c.title);
    const prev = map.get(store) ?? { amount: 0, count: 0, usedCount: 0 };
    prev.amount += c.discountAmount ?? 0;
    prev.count += 1;
    if (c.isUsed) prev.usedCount += 1;
    map.set(store, prev);
  }
  return Array.from(map.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount);
}
