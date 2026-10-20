/**
 * 优惠券数据模型（v2）
 * 与 shared/schemas/coupon.json 保持一致
 */

export type DiscountType = 'amount' | 'percentage' | 'full' | 'group';

export interface VersionVectorEntry {
  deviceId: string;
  counter: number;
}

export interface Coupon {
  id: string;
  title: string;
  description: string | null;
  discountType: DiscountType | null;
  discountAmount: number | null;
  fullAmount: number | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  endHour: number | null;
  endMinute: number | null;
  isReminded: boolean;
  remindedDays: number[];
  isUsed: boolean;
  notes: string | null;
  createdAt: string; // ISO 8601 with +08:00 or timezone-less interpreted as +08:00
  updatedAt: string | null;
  version: VersionVectorEntry | null;
  modifiedAt: string | null;
}

export interface CouponDataPackage {
  schemaVersion: number;
  coupons: Coupon[];
  deletedIds: string[];
}

export interface SyncCheckpoint {
  schemaVersion: number;
  deviceId: string;
  deviceName: string | null;
  vectorClock: Record<string, number>;
  lastSyncAt: string | null;
  pendingChanges: number;
  conflictCount: number;
}

export interface WebDAVSettings {
  url: string;
  username: string;
  password: string;
  rootPath: string;
}

export interface ReminderSettings {
  enabled: boolean;
  remindDays: number[];
  quietStart: string | null; // HH:mm
  quietEnd: string | null;   // HH:mm
}

export interface AISettings {
  provider: string;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
}

export interface AppSettings {
  schemaVersion: number;
  webdav: WebDAVSettings;
  sync: {
    autoSync: boolean;
    syncIntervalMinutes: number;
    syncOnWifiOnly: boolean;
  };
  reminder: ReminderSettings;
  ai: AISettings;
}
