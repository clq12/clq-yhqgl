/**
 * 乐观锁判定（纯函数，无任何浏览器/网络依赖）。
 *
 * 为什么单独抽出来：
 * 1. 网页端 `appDb.putCoupon` 与「待解决」裁决都要用它，逻辑只能有一份；
 * 2. 它是**可以脱离云端跑测试**的部分 —— `scripts/concurrency-check.mjs`
 *    直接 import 这个文件做双设备并发回归，不需要真连数据库。
 *
 * 语义（与 shared/rules/sync-protocol.md §5 一致）：
 * - 云端没有这条 → insert
 * - 云端比本地新 → conflict（整条拦下，不做字段级合并）
 * - 否则 → update
 *
 * 时间取 `modifiedAt || updatedAt || createdAt`：老数据可能没有 modifiedAt，
 * 退回 updatedAt/createdAt 才不至于把「刚建的券」当成 1970 年。
 */

export type WriteDecision = 'insert' | 'update' | 'conflict';

export interface SyncTimestamps {
  modifiedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}

/** 把一条记录的三个时间字段压成可比较的毫秒数；解析不了按 0 处理 */
export function timestampOf(record: SyncTimestamps | null | undefined): number {
  if (!record) return 0;
  const raw = record.modifiedAt || record.updatedAt || record.createdAt;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 决定这次写入该怎么落。
 *
 * @param local  本地要写入的版本
 * @param remote 云端当前版本；不存在传 null
 */
export function decideWrite(
  local: SyncTimestamps,
  remote: SyncTimestamps | null | undefined,
): WriteDecision {
  if (!remote) return 'insert';
  // 严格大于才算冲突：两端同一毫秒写入时，按「后写者胜」放行，
  // 否则同一秒内的连续两次编辑会互相卡死。
  if (timestampOf(remote) > timestampOf(local)) return 'conflict';
  return 'update';
}

/**
 * 冲突裁决：保留本地版本时用的时间戳。
 *
 * 必须把 modified_at 推到「当前时刻 + 1ms」：
 * 如果还用原来的时间，下一轮同步会再次判成冲突，用户会陷入死循环。
 */
export function bumpedTimestamp(nowMs: number = Date.now()): string {
  return new Date(nowMs + 1).toISOString();
}

/**
 * 冲突裁决：保留云端版本时，本地该存什么。
 * 只是把云端那条原样落到本地，提醒状态这类本地字段要保留本地值
 * （提醒按设备各算，不能被别的设备覆盖）。
 */
export function mergeCloudOverLocal<T extends Record<string, unknown>>(
  local: T | undefined,
  remote: T,
): T {
  if (!local) return remote;
  const localOnly: Record<string, unknown> = {};
  for (const key of ['isReminded', 'remindedDays']) {
    if (key in local) localOnly[key] = local[key];
  }
  return { ...remote, ...localOnly } as T;
}
