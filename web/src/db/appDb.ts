import { cloud } from '../cloud';
import type { Coupon, AppSettings } from '../types/coupon';
import * as localDB from './indexedDB';

// 云端数据库与本地 IndexedDB 的统一数据层。
// 当用户已登录时优先走 WorkBuddy Cloud（数据跨设备同步），
// 未登录时回退到 IndexedDB（纯本地离线可用）。

async function isCloudReady(): Promise<boolean> {
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
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    version: c.version,
    modified_at: c.modifiedAt,
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
    createdAt: String(row.created_at),
    updatedAt: row.updated_at === null ? null : String(row.updated_at),
    version: row.version as Coupon['version'],
    modifiedAt: row.modified_at === null ? null : String(row.modified_at),
  };
}

function settingsToRow(s: AppSettings): Record<string, unknown> {
  return {
    id: 'current',
    webdav: s.webdav,
    sync: s.sync,
    reminder: s.reminder,
    ai: s.ai,
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
    return (data ?? []).map((row: Record<string, unknown>) => rowToCoupon(row));
  }
  return localDB.listCoupons();
}

export async function getCoupon(id: string): Promise<Coupon | undefined> {
  if (await isCloudReady()) {
    const { data, error } = await cloud.database.from('coupons').select('*').eq('id', id).maybeSingle();
    if (error || !data) return undefined;
    return rowToCoupon(data as Record<string, unknown>);
  }
  return localDB.getCoupon(id);
}

export async function putCoupon(coupon: Coupon): Promise<void> {
  if (await isCloudReady()) {
    const { data: existing } = await cloud.database.from('coupons').select('id').eq('id', coupon.id).maybeSingle();
    const row = couponToRow(coupon);
    const { error } = existing
      ? await cloud.database.from('coupons').update(row as any).eq('id', coupon.id)
      : await cloud.database.from('coupons').insert(row as any);
    if (error) {
      console.warn('[cloud] putCoupon failed, fallback to local:', error.message);
      await localDB.putCoupon(coupon);
      return;
    }
  }
  await localDB.putCoupon(coupon);
}

export async function putCoupons(coupons: Coupon[]): Promise<void> {
  for (const c of coupons) {
    await putCoupon(c);
  }
}

export async function deleteCouponLocal(id: string): Promise<void> {
  if (await isCloudReady()) {
    const { error } = await cloud.database.from('coupons').delete().eq('id', id);
    if (error) {
      console.warn('[cloud] deleteCoupon failed, fallback to local:', error.message);
      await localDB.deleteCouponLocal(id);
      return;
    }
  }
  await localDB.deleteCouponLocal(id);
}

export async function clearCoupons(): Promise<void> {
  if (await isCloudReady()) {
    const { error } = await cloud.database.from('coupons').delete().neq('id', '');
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
