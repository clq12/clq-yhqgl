import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Coupon, AppSettings } from '../types/coupon';

interface YhqDB extends DBSchema {
  coupons: {
    key: string;
    value: Coupon;
    indexes: { 'by-end-date': string };
  };
  settings: {
    key: number;
    value: AppSettings;
  };
}

const DB_NAME = 'clq-yhqgl-v2';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<YhqDB>> | null = null;

function upgradeDatabase(database: IDBPDatabase<YhqDB>) {
  if (!database.objectStoreNames.contains('coupons')) {
    const store = database.createObjectStore('coupons', { keyPath: 'id' });
    store.createIndex('by-end-date', 'endDate');
  }
  if (!database.objectStoreNames.contains('settings')) {
    database.createObjectStore('settings', { keyPath: 'schemaVersion' });
  }
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function openWithRecovery(): Promise<IDBPDatabase<YhqDB>> {
  try {
    const opened = await openDB<YhqDB>(DB_NAME, DB_VERSION, {
      upgrade: upgradeDatabase,
      blocked() {
        console.warn('[db] upgrade blocked by another connection');
      },
      blocking() {
        console.warn('[db] this connection is blocking an upgrade');
      },
      terminated() {
        console.warn('[db] connection terminated');
        dbPromise = null;
      },
    });
    return opened;
  } catch (e) {
    // 旧版本数据库可能缺少对象仓库，删除后按最新结构重建
    console.warn('[local] 重建本地数据库：', e);
    await deleteDatabase();
    return openDB<YhqDB>(DB_NAME, DB_VERSION, { upgrade: upgradeDatabase });
  }
}

export function initDB(): Promise<IDBPDatabase<YhqDB>> {
  if (!dbPromise) {
    dbPromise = Promise.race([
      openWithRecovery(),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('本地数据库初始化超时')), 8000),
      ),
    ]).catch(async (e) => {
      console.warn('[db] 初始化失败，重置后重试：', e);
      dbPromise = null;
      await deleteDatabase();
      return openWithRecovery();
    });
  }
  return dbPromise;
}

export async function getDB(): Promise<IDBPDatabase<YhqDB>> {
  return initDB();
}

// Coupon CRUD
export async function listCoupons(): Promise<Coupon[]> {
  const d = await getDB();
  const all = await d.getAll('coupons');
  return all.filter((c) => !c.deletedAt);
}

export async function getCoupon(id: string): Promise<Coupon | undefined> {
  const d = await getDB();
  const coupon = await d.get('coupons', id);
  return coupon && !coupon.deletedAt ? coupon : undefined;
}

export async function putCoupon(coupon: Coupon): Promise<void> {
  const d = await getDB();
  await d.put('coupons', coupon);
}

export async function putCoupons(coupons: Coupon[]): Promise<void> {
  const d = await getDB();
  const tx = d.transaction('coupons', 'readwrite');
  await Promise.all(coupons.map((c) => tx.store.put(c)));
  await tx.done;
}

export async function deleteCouponLocal(id: string): Promise<void> {
  const d = await getDB();
  await d.delete('coupons', id);
}

export async function clearCoupons(): Promise<void> {
  const d = await getDB();
  await d.clear('coupons');
}

// Settings
export async function getSettings(): Promise<AppSettings | undefined> {
  const d = await getDB();
  return d.get('settings', 2);
}

export async function putSettings(settings: AppSettings): Promise<void> {
  const d = await getDB();
  await d.put('settings', settings);
}
