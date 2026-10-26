/**
 * 「待解决」冲突登记簿（网页端）。
 *
 * 乐观锁命中时不会静默覆盖，也不做字段级合并 —— 那一版本地改动先存进这里，
 * 由用户在「待解决」列表里裁决：以云端为准，或用自己的版本覆盖。
 *
 * 存 localStorage 而不是 IndexedDB：这只是一份短命的待办清单（处理完就删），
 * 不需要索引/事务，而且 Service Worker 与主线程都能读，出问题时用户也能自己清。
 */
import type { Coupon } from '../types/coupon';

export interface PendingConflict {
  /** 券 id */
  id: string;
  title: string;
  /** 被拦下的本地版本 */
  local: Coupon;
  /** 云端当时的版本 */
  remote: Coupon;
  /** 发现冲突的时间（ISO） */
  detectedAt: string;
}

const STORAGE_KEY = 'yhqgl-conflicts';
const EVENT_NAME = 'yhqgl:conflicts';

function read(): PendingConflict[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingConflict[]) : [];
  } catch {
    return [];
  }
}

function write(list: PendingConflict[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略即可 */
  }
  notify();
}

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* 非浏览器环境（测试脚本）忽略 */
  }
}

export function listConflicts(): PendingConflict[] {
  // 同一张券只留最新一次冲突，避免列表里堆一串同一个标题
  const map = new Map<string, PendingConflict>();
  for (const item of read()) map.set(item.id, item);
  return Array.from(map.values()).sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1));
}

export function conflictCount(): number {
  return listConflicts().length;
}

/** 记一条冲突（同一张券重复命中就覆盖成最新的一版） */
export function recordConflict(local: Coupon, remote: Coupon): void {
  const next = read().filter((c) => c.id !== local.id);
  next.push({
    id: local.id,
    title: local.title || remote.title || '未命名优惠券',
    local,
    remote,
    detectedAt: new Date().toISOString(),
  });
  write(next);
}

export function dropConflict(id: string): void {
  write(read().filter((c) => c.id !== id));
}

export function clearConflicts(): void {
  write([]);
}

/** 订阅冲突数量变化；返回取消订阅函数 */
export function subscribeConflicts(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}
