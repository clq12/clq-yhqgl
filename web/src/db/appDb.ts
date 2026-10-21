import { cloud } from '../cloud';
import type { Coupon, AppSettings } from '../types/coupon';
import * as localDB from './indexedDB';

// 云端数据库与本地 IndexedDB 的统一数据层。
// 当用户已登录时优先走 WorkBuddy Cloud（数据跨设备同步），
// 未登录时回退到 IndexedDB（纯本地离线可用）。

export async function isCloudReady(): Promise<boolean> {
  try {
    const { data: session, error } = await cloud.auth.getSession();
    return !!session && !error;
  } catch {
    return false;
  }
}

function couponToRow(c: Coupon): Record<string, unknown> {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    discount_type: c.discountType,
    discount_amount: c.discountAmount,
    full_amount: c.fullAmount,
    start_date: c.startDate,
    end_date: c.endDate,
    end_hour: c.endHour,
    end_minute: c.endMinute,
    is_reminded: c.isReminded,
    reminded_days: c.remindedDays,
    is_used: c.isUsed,
    notes: c.notes,
    // 云端列是 jsonb 数组；老记录可能没有这一列，读的时候兜底成空数组
    tags: c.tags ?? [],
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    version: c.version,
    modified_at: c.modifiedAt,
    deleted_at: c.deletedAt ?? null,
  };
}

function rowToCoupon(row: Record<string, unknown>): Coupon {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description === null ? null : String(row.description),
    discountType: row.discount_type as Coupon['discountType'],
    discountAmount: row.discount_amount === null ? null : Number(row.discount_amount),
    fullAmount: row.full_amount === null ? null : Number(row.full_amount),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    endHour: row.end_hour === null ? null : Number(row.end_hour),
    endMinute: row.end_minute === null ? null : Number(row.end_minute),
    isReminded: Boolean(row.is_reminded),
    remindedDays: Array.isArray(row.reminded_days) ? row.reminded_days.map(Number) : [],
    isUsed: Boolean(row.is_used),
    notes: row.notes === null ? null : String(row.notes),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    createdAt: String(row.created_at),
    updatedAt: row.updated_at === null ? null : String(row.updated_at),
    version: row.version as Coupon['version'],
    modifiedAt: row.modified_at === null ? null : String(row.modified_at),
    deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at),
  };
}

function settingsToRow(s: AppSettings): Record<string, unknown> {
  return {
    id: 'current',
    webdav: s.webdav,
    sync: s.sync,
    reminder: s.reminder,
    ai: s.ai,
    tags: s.tagLibrary ?? [],
    updated_at: s.schemaVersion ? new Date().toISOString() : null,
  };
}

function rowToSettings(row: Record<string, unknown>): AppSettings {
  const webdav = row.webdav as AppSettings['webdav'] | null;
  const sync = row.sync as AppSettings['sync'] | null;
  const reminder = row.reminder as AppSettings['reminder'] | null;
  const ai = row.ai as AppSettings['ai'] | null;
  return {
    schemaVersion: 2,
    webdav: webdav ?? {
      url: '',
      username: '',
      password: '',
      rootPath: '/yhqgl/v2',
    },
    sync: sync ?? { autoSync: true, syncIntervalMinutes: 15, syncOnWifiOnly: false },
    reminder: reminder ?? { enabled: true, remindDays: [7, 3, 1], quietStart: null, quietEnd: null },
    ai: ai ?? { provider: 'agnes', apiKey: null, baseUrl: null, model: null },
    tagLibrary: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [],
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  if (await isCloudReady()) {
    const { data, error } = await cloud.database
      .from('coupons')
      .select('*')
      .order('end_date', { ascending: true });
    if (error) {
      console.warn('[cloud] listCoupons failed, fallback to local:', error.message);
      return localDB.listCoupons();
    }
    // 软删除记录不能出现在列表里
    return (data ?? [])
      .map((row: Record<string, unknown>) => rowToCoupon(row))
      .filter((c: Coupon) => !c.deletedAt);
  }
  return localDB.listCoupons();
}

export async function getCoupon(id: string): Promise<Coupon | undefined> {
  if (await isCloudReady()) {
    const { data, error } = await cloud.database.from('coupons').select('*').eq('id', id).maybeSingle();
    if (error || !data) return undefined;
    const coupon = rowToCoupon(data as Record<string, unknown>);
    return coupon.deletedAt ? undefined : coupon;
  }
  return localDB.getCoupon(id);
}

/**
 * 乐观锁冲突：云端这一条比本地提交的更新。
 * 上层应把 remote 的当前值展示给用户，由用户决定保留哪一版。
 */
export class SyncConflictError extends Error {
  readonly remote: Coupon;
  constructor(remote: Coupon) {
    super('这张券在别的设备上刚被改过');
    this.name = 'SyncConflictError';
    this.remote = remote;
  }
}

function timestampOf(c: Coupon): number {
  const raw = c.modifiedAt || c.updatedAt || c.createdAt;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export async function putCoupon(coupon: Coupon): Promise<void> {
  if (await isCloudReady()) {
    const { data: existing, error: readError } = await cloud.database
      .from('coupons')
      .select('*')
      .eq('id', coupon.id)
      .maybeSingle();
    if (readError) {
      console.warn('[cloud] putCoupon pre-read failed, fallback to local:', readError.message);
      await localDB.putCoupon(coupon);
      return;
    }
    const row = couponToRow(coupon);
    if (existing) {
      // 乐观锁：云端更晚才被改过，就拒绝这次写入
      const remote = rowToCoupon(existing as Record<string, unknown>);
      if (timestampOf(remote) > timestampOf(coupon)) {
        throw new SyncConflictError(remote);
      }
      const { error } = await cloud.database.from('coupons').update(row as any).eq('id', coupon.id);
      if (error) {
        console.warn('[cloud] putCoupon failed, fallback to local:', error.message);
        await localDB.putCoupon(coupon);
        return;
      }
    } else {
      const { error } = await cloud.database.from('coupons').insert(row as any);
      if (error) {
        console.warn('[cloud] putCoupon failed, fallback to local:', error.message);
        await localDB.putCoupon(coupon);
        return;
      }
    }
  }
  await localDB.putCoupon(coupon);
}

export async function putCoupons(coupons: Coupon[]): Promise<void> {
  for (const c of coupons) {
    await putCoupon(c);
  }
}

/** 软删除：只打 deleted_at 标记，不物理删除，两端都不会把已删数据复活 */
export async function deleteCouponLocal(id: string): Promise<void> {
  const nowIso = new Date().toISOString();
  if (await isCloudReady()) {
    const { data: existing } = await cloud.database.from('coupons').select('*').eq('id', id).maybeSingle();
    if (existing) {
      const remote = rowToCoupon(existing as Record<string, unknown>);
      const { error } = await cloud.database
        .from('coupons')
        .update({ deleted_at: nowIso, modified_at: nowIso, updated_at: nowIso } as any)
        .eq('id', id);
      if (error) {
        console.warn('[cloud] soft delete failed, fallback to local:', error.message);
        await localDB.deleteCouponLocal(id);
        return;
      }
      // 本地同步打标记，避免离线时又把它当正常数据推回去
      await localDB.putCoupon({ ...remote, deletedAt: nowIso, modifiedAt: nowIso, updatedAt: nowIso });
      return;
    }
  }
  await localDB.deleteCouponLocal(id);
}

export async function clearCoupons(): Promise<void> {
  const nowIso = new Date().toISOString();
  if (await isCloudReady()) {
    const { error } = await cloud.database
      .from('coupons')
      .update({ deleted_at: nowIso, modified_at: nowIso } as any)
      .neq('id', '');
    if (error) {
      console.warn('[cloud] clearCoupons failed, fallback to local:', error.message);
      await localDB.clearCoupons();
      return;
    }
  }
  await localDB.clearCoupons();
}

export async function getSettings(): Promise<AppSettings | undefined> {
  if (await isCloudReady()) {
    const { data, error } = await cloud.database.from('settings').select('*').eq('id', 'current').maybeSingle();
    if (error) {
      console.warn('[cloud] getSettings failed, fallback to local:', error.message);
      return localDB.getSettings();
    }
    if (!data) return undefined;
    return rowToSettings(data as Record<string, unknown>);
  }
  return localDB.getSettings();
}

export async function putSettings(settings: AppSettings): Promise<void> {
  if (await isCloudReady()) {
    const { data: existing } = await cloud.database.from('settings').select('id').eq('id', 'current').maybeSingle();
    const row = settingsToRow(settings);
    const { error } = existing
      ? await cloud.database.from('settings').update(row as any).eq('id', 'current')
      : await cloud.database.from('settings').insert(row as any);
    if (error) {
      console.warn('[cloud] putSettings failed, fallback to local:', error.message);
      await localDB.putSettings(settings);
      return;
    }
  }
  await localDB.putSettings(settings);
}

// ---------------------------------------------------------------------------
// 登录后的账号数据对齐
// ---------------------------------------------------------------------------

export interface AccountSyncResult {
  ok: boolean;
  /** 云端原有记录数 */
  cloudCount: number;
  /** 本次从本地补充上云的记录数 */
  pushed: number;
  /** 对齐后本地可见的记录总数 */
  total: number;
  /** 是否把本地设置也迁移到了云端 */
  settingsPushed: boolean;
  error?: string;
}

function recordTime(c: Coupon): number {
  const raw = c.modifiedAt || c.updatedAt || c.createdAt;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

const LAST_USER_KEY = 'yhqgl-last-user';

const EMPTY_SETTINGS: AppSettings = {
  schemaVersion: 2,
  webdav: { url: '', username: '', password: '', rootPath: '/yhqgl/v2' },
  sync: { autoSync: true, syncIntervalMinutes: 15, syncOnWifiOnly: false },
  reminder: { enabled: true, remindDays: [7, 3, 1], quietStart: null, quietEnd: null },
  ai: { provider: 'agnes', apiKey: null, baseUrl: null, model: null },
  tagLibrary: [],
};

/**
 * 登录后调用：拉取该账号在云端的全部优惠券，与本地缓存合并。
 * - 云端没有、本地有 → 视为首次登录的历史数据，补传上云
 * - 两端都有 → 取修改时间较新的一份
 * - 云端有、本地没有 → 直接拉取
 * 完成后把结果写回本地 IndexedDB，保证离线打开也有数据。
 */
export async function syncAccountData(): Promise<AccountSyncResult> {
  const { data: session, error: sessionError } = await cloud.auth.getSession();
  if (sessionError || !session) {
    return { ok: false, cloudCount: 0, pushed: 0, total: 0, settingsPushed: false, error: '未登录' };
  }

  const currentUserId = session.user.id;
  let lastUserId: string | null = null;
  try {
    lastUserId = localStorage.getItem(LAST_USER_KEY);
  } catch {
    lastUserId = null;
  }
  // 同一台设备之前登录过其他账号时，不能把上一个账号的本地缓存推到当前账号
  const sameOwner = !lastUserId || lastUserId === currentUserId;

  const localCoupons = await localDB.listCoupons();
  const localSettings = await localDB.getSettings();

  const { data: cloudRows, error: cloudError } = await cloud.database
    .from('coupons')
    .select('*')
    .order('end_date', { ascending: true });

  if (cloudError) {
    return {
      ok: false,
      cloudCount: 0,
      pushed: 0,
      total: localCoupons.length,
      settingsPushed: false,
      error: cloudError.message,
    };
  }

  const cloudCoupons = (cloudRows ?? [])
    .map((row: Record<string, unknown>) => rowToCoupon(row))
    .filter((c: Coupon) => !c.deletedAt);
  const cloudMap = new Map(cloudCoupons.map((c) => [c.id, c]));

  const toPush: Coupon[] = [];
  if (sameOwner) {
    for (const local of localCoupons) {
      if (local.deletedAt) continue; // 已删除的本地记录不再推上云
      const remote = cloudMap.get(local.id);
      if (!remote) {
        toPush.push(local);
      } else if (recordTime(local) > recordTime(remote)) {
        toPush.push(local);
      }
    }
  }

  let pushed = 0;
  for (const coupon of toPush) {
    const row = couponToRow(coupon);
    const { error } = cloudMap.has(coupon.id)
      ? await cloud.database.from('coupons').update(row as any).eq('id', coupon.id)
      : await cloud.database.from('coupons').insert(row as any);
    if (!error) pushed += 1;
    else console.warn('[cloud] migrate coupon failed:', coupon.id, error.message);
  }

  let settingsPushed = false;
  if (sameOwner && localSettings) {
    const { data: cloudSettings, error: settingsError } = await cloud.database
      .from('settings')
      .select('id')
      .eq('id', 'current')
      .maybeSingle();
    if (!settingsError && !cloudSettings) {
      const row = settingsToRow(localSettings);
      const { error } = await cloud.database.from('settings').insert(row as any);
      settingsPushed = !error;
    }
  }

  // 以云端为最终真相，回写本地缓存
  const { data: finalRows, error: finalError } = await cloud.database
    .from('coupons')
    .select('*')
    .order('end_date', { ascending: true });

  if (finalError) {
    return {
      ok: false,
      cloudCount: cloudCoupons.length,
      pushed,
      total: localCoupons.length,
      settingsPushed,
      error: finalError.message,
    };
  }

  const finalCoupons = (finalRows ?? [])
    .map((row: Record<string, unknown>) => rowToCoupon(row))
    .filter((c: Coupon) => !c.deletedAt);
  await localDB.clearCoupons();
  await localDB.putCoupons(finalCoupons);

  const { data: cloudSettings } = await cloud.database
    .from('settings')
    .select('*')
    .eq('id', 'current')
    .maybeSingle();

  if (cloudSettings) {
    await localDB.putSettings(rowToSettings(cloudSettings as Record<string, unknown>));
  } else if (!sameOwner) {
    // 切换账号且新账号还没有设置：清空上一个账号残留的本地设置（含 AI Key）
    await localDB.putSettings(EMPTY_SETTINGS);
  }

  try {
    localStorage.setItem(LAST_USER_KEY, currentUserId);
  } catch {
    /* localStorage 不可用时忽略 */
  }

  return {
    ok: true,
    cloudCount: cloudCoupons.length,
    pushed,
    total: finalCoupons.length,
    settingsPushed,
  };
}
