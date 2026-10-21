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
  /**
   * 标签（自由文本，已归一化去重）。
   * 用途：按平台/场景筛选（抖音、拼多多、淘宝、美团…），录入时自动复用历史标签。
   */
  tags: string[];
  createdAt: string; // ISO 8601 with +08:00 or timezone-less interpreted as +08:00
  updatedAt: string | null;
  version: VersionVectorEntry | null;
  modifiedAt: string | null;
  /** 软删除标记：非 null 表示已删除。唯一真相，不要再引第二个布尔字段。 */
  deletedAt?: string | null;
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

/**
 * 一个 AI 助手配置。
 *
 * 为什么要多个：识别文字指令和识别图片往往不是同一个模型最划算
 * （文本用便宜的小模型，识图要上多模态），而且不同家的 key 也想分开存。
 */
export interface AiAssistant {
  id: string;
  name: string;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  apiKey: string | null;
  /** 是否支持图片输入：识图添加只会列出勾了这个的助手 */
  vision: boolean;
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
  /** 多个 AI 助手；空数组表示还没配置过，用上面的 ai 作为唯一助手 */
  aiAssistants: AiAssistant[];
  /** 当前选中的助手 id；null 时取列表第一个 */
  activeAssistantId: string | null;
  /**
   * 用户维护的标签库（设置页里增删改的就是它）。
   * 空数组 = 还没动过，用 shared/data/tags.json 的默认名单。
   * 一旦编辑过就落成显式列表 —— 否则「删掉某个默认标签」下次又会被默认名单带回来。
   */
  tagLibrary: string[];
}
