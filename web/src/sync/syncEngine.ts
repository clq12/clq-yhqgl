/**
 * ⚠️ DEPRECATED — 死代码，请勿引用，应从仓库删除（git rm）。
 *
 * 本文件实现的是 v2 架构下的「WebDAV 自动三向合并同步」
 * （版本向量时钟 vectorClock + 字段级合并 + deletedIds 硬删除）。
 *
 * 自 v3 起，设备间同步的唯一通道是 WorkBuddy 云端数据库（见 src/db/appDb.ts）：
 *   - 乐观锁以 modified_at 为准，冲突时整条记录进入「待解决」，不再做字段级合并；
 *   - 删除为软删除（deleted_at），不再依赖本文件的 deletedIds 列表；
 *   - 向量时钟（SyncCheckpoint.vectorClock）不再用于冲突判定
 *     （见 shared/schemas/sync.json 的【遗留字段】标注）。
 *
 * 当前本文件未被任何活跃代码引用（AuthContext / appDb 均已走云端），属孤立死代码。
 * 因 GitHub MCP 不支持删除文件，请在本机执行：
 *     git rm web/src/sync/syncEngine.ts
 * 后再提交。详见 docs/ARCHITECTURE.md 与 shared/rules/sync-protocol.md。
 */

import type { Coupon, CouponDataPackage, SyncCheckpoint } from '../types/coupon';
import {
  clearCoupons,
  getSettings,
  listCoupons,
  putCoupons,
  putSyncCheckpoint,
} from '../db/indexedDB';
import { WebDAVClient } from './webdav';

const DATA_PATH = 'data.json';
const SYNC_PATH = 'sync.json';

function generateDeviceId(): string {
  let id = localStorage.getItem('yhqgl-device-id');
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    localStorage.setItem('yhqgl-device-id', id);
  }
  return id;
}

function now(): string {
  return new Date().toISOString();
}

function mergeRecords(local: Coupon, remote: Coupon): { coupon: Coupon; conflict: boolean } {
  const lv = local.version;
  const rv = remote.version;
  if (!lv || !rv) return { coupon: remote, conflict: false };
  if (lv.deviceId === rv.deviceId) {
    return { coupon: lv.counter >= rv.counter ? local : remote, conflict: false };
  }
  const lt = local.modifiedAt || local.updatedAt || local.createdAt;
  const rt = remote.modifiedAt || remote.updatedAt || remote.createdAt;
  const conflict = true;
  if (lt > rt) return { coupon: local, conflict };
  if (rt > lt) return { coupon: remote, conflict };
  return { coupon: local.id >= remote.id ? local : remote, conflict };
}

export interface SyncResult {
  success: boolean;
  checkpoint?: SyncCheckpoint;
  error?: string;
}

export async function sync(): Promise<SyncResult> {
  const settings = await getSettings();
  if (!settings?.webdav) {
    return { success: false, error: 'WebDAV 未配置' };
  }

  const client = new WebDAVClient(settings.webdav);
  const root = settings.webdav.rootPath.replace(/^\//, '').replace(/\/$/, '');
  await client.mkcol(root);
  await client.mkcol(`${root}/backups`);

  const deviceId = generateDeviceId();

  // 读取远程
  const remoteDataRaw = await client.get(DATA_PATH);
  const remoteData: CouponDataPackage = remoteDataRaw
    ? JSON.parse(remoteDataRaw)
    : { schemaVersion: 2, coupons: [], deletedIds: [] };

  const remoteSyncRaw = await client.get(SYNC_PATH);
  const remoteSync: SyncCheckpoint | undefined = remoteSyncRaw ? JSON.parse(remoteSyncRaw) : undefined;

  // 读取本地
  const localCoupons = await listCoupons();
  const localMap = new Map(localCoupons.map((c) => [c.id, c]));
  const remoteMap = new Map(remoteData.coupons.map((c) => [c.id, c]));

  const merged: Coupon[] = [];
  const deletedIds = new Set<string>(remoteData.deletedIds);
  let conflictCount = 0;

  const allIds = new Set([...localMap.keys(), ...remoteMap.keys(), ...deletedIds]);

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    const remoteDeleted = deletedIds.has(id);
    const localDeleted = !local; // 本地无记录视为已删除（简化版，后续支持 soft delete）

    if (!local && remote && !remoteDeleted) {
      merged.push(remote);
    } else if (!remote && local && !localDeleted) {
      merged.push(local);
    } else if (local && remote) {
      const { coupon, conflict } = mergeRecords(local, remote);
      if (conflict) conflictCount++;
      merged.push(coupon);
    }
  }

  // 更新向量时钟
  const vectorClock: Record<string, number> = { ...(remoteSync?.vectorClock || {}) };
  vectorClock[deviceId] = (vectorClock[deviceId] || 0) + 1;

  const checkpoint: SyncCheckpoint = {
    schemaVersion: 2,
    deviceId,
    deviceName: '网页端',
    vectorClock,
    lastSyncAt: now(),
    pendingChanges: 0,
    conflictCount,
  };

  const newData: CouponDataPackage = {
    schemaVersion: 2,
    coupons: merged,
    deletedIds: Array.from(deletedIds),
  };

  const dataOk = await client.put(DATA_PATH, JSON.stringify(newData, null, 2));
  const syncOk = await client.put(SYNC_PATH, JSON.stringify(checkpoint, null, 2));

  if (!dataOk || !syncOk) {
    return { success: false, error: '上传同步数据失败' };
  }

  await clearCoupons();
  await putCoupons(merged);
  await putSyncCheckpoint(checkpoint);

  return { success: true, checkpoint };
}

export async function bumpVersion(coupon: Coupon): Promise<Coupon> {
  const deviceId = generateDeviceId();
  const counter = (coupon.version?.counter || 0) + 1;
  const time = now();
  return {
    ...coupon,
    version: { deviceId, counter },
    modifiedAt: time,
    updatedAt: time,
  };
}
