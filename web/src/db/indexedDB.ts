import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Coupon, SyncCheckpoint, AppSettings } from '../types/coupon';

interface YhqDB extends DBSchema {
  coupons: {
    key: string;
    value: Coupon;
    indexes: { 'by-end-date': string };
  };
  sync: {
    key: string;
    value: SyncCheckpoint;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
}

const DB_NAME = 'clq-yhqgl';
const DB_VERSION = 1;

let db: IDBPDatabase<YhqDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<YhqDB>> {
  if (db) return db;
  db = await openDB<YhqDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('coupons')) {
        const store = database.createObjectStore('coupons', { keyPath: 'id' });
        store.createIndex('by-end-date', 'endDate');
      }
      if (!database.objectStoreNames.contains('sync')) {
        database.createObjectStore('sync', { keyPath: 'deviceId' });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'schemaVersion' });
      }
    },
  });
  return db;
}

export async function getDB(): Promise<IDBPDatabase<YhqDB>> {
  if (!db) await initDB();
  return db!;
}

// Coupon CRUD
export async function listCoupons(): Promise<Coupon[]> {
  const d = await getDB();
  return d.getAll('coupons');
}

export async function getCoupon(id: string): Promise<Coupon | undefined> {
  const d = await getDB();
  return d.get('coupons', id);
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

// Sync
export async function getSyncCheckpoint(deviceId: string): Promise<SyncCheckpoint | undefined> {
  const d = await getDB();
  return d.get('sync', deviceId);
}

export async function putSyncCheckpoint(checkpoint: SyncCheckpoint): Promise<void> {
  const d = await getDB();
  await d.put('sync', checkpoint);
}

// Settings
export async function getSettings(): Promise<AppSettings | undefined> {
  const d = await getDB();
  return d.get('settings', 2 as unknown as string);
}

export async function putSettings(settings: AppSettings): Promise<void> {
  const d = await getDB();
  await d.put('settings', settings);
}
