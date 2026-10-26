/**
 * 手动备份 / 恢复：把本地优惠券导出到（或从）用户配置的 WebDAV 网盘读写。
 *
 * 这是 v3 下 WebDAV 的唯一用途——可选的「一键手动备份」出口 + 恢复入口，不参与设备间同步。
 * 设备间同步请走云端（见 src/db/appDb.ts）。导出为单向动作：读本地、写远程，不读回、不合并。
 *
 * 备份结构：
 *   {root}/data.json              始终指向最近一次导出（latest）
 *   {root}/backups/backup-*.json  带时间戳的历史快照，便于回滚
 */
import type { AppSettings, Coupon } from '../types/coupon';
import * as localDB from '../db/indexedDB';
import { isCloudReady, putCoupons } from '../db/appDb';
import { WebDAVClient } from './webdav';

const BACKUP_LATEST = 'data.json';
const BACKUP_DIR = 'backups';

export interface BackupResult {
  ok: boolean;
  error?: string;
  path?: string;
}

export interface RestoreResult {
  ok: boolean;
  error?: string;
  count?: number;
  pushedToCloud?: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function backupToWebDAV(settings: AppSettings): Promise<BackupResult> {
  const webdav = settings.webdav;
  if (!webdav || !webdav.url) {
    return { ok: false, error: '未配置 WebDAV' };
  }

  const client = new WebDAVClient(webdav);
  const root = webdav.rootPath.replace(/^\//, '').replace(/\/$/, '');

  try {
    await client.mkcol(root);
    await client.mkcol(`${root}/${BACKUP_DIR}`);
  } catch (e) {
    return { ok: false, error: '创建目录失败：' + errMsg(e) };
  }

  const coupons = (await localDB.listCoupons()).filter((c) => !c.deletedAt);
  const payload = {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    note: 'v3 手动备份，仅导出本地数据；设备间同步请使用云端',
    coupons,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const historyPath = `${BACKUP_DIR}/backup-${ts}.json`;

  try {
    const historyOk = await client.put(historyPath, JSON.stringify(payload, null, 2));
    const latestOk = await client.put(BACKUP_LATEST, JSON.stringify(payload, null, 2));
    if (!historyOk || !latestOk) {
      return { ok: false, error: '写入备份文件失败' };
    }
    return { ok: true, path: historyPath };
  } catch (e) {
    return { ok: false, error: '写入备份文件失败：' + errMsg(e) };
  }
}

/**
 * 从 WebDAV 恢复：优先读 latest，缺失时回退到 backups/ 里时间戳最新的一份。
 * 先覆盖本地，再（若已登录）以本地为准覆盖云端。
 */
export async function restoreFromWebDAV(settings: AppSettings): Promise<RestoreResult> {
  const webdav = settings.webdav;
  if (!webdav || !webdav.url) {
    return { ok: false, error: '未配置 WebDAV' };
  }

  const client = new WebDAVClient(webdav);
  const root = webdav.rootPath.replace(/^\//, '').replace(/\/$/, '');

  let raw = await client.get(BACKUP_LATEST);
  if (!raw) {
    const names = await client.listDir(`${root}/${BACKUP_DIR}`);
    const latest = names.length ? names[names.length - 1] : null;
    if (latest) raw = await client.get(`${BACKUP_DIR}/${latest}`);
  }
  if (!raw) {
    return { ok: false, error: '未找到任何备份文件' };
  }

  let parsed: { coupons?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: '备份文件解析失败：' + errMsg(e) };
  }
  const coupons = (Array.isArray(parsed.coupons) ? parsed.coupons : []) as Coupon[];

  await localDB.clearCoupons();
  await localDB.putCoupons(coupons);

  let pushedToCloud = false;
  if (await isCloudReady()) {
    const nowIso = new Date().toISOString();
    const toPush = coupons.map((c) => ({ ...c, modifiedAt: nowIso, updatedAt: nowIso }));
    try {
      await putCoupons(toPush);
      pushedToCloud = true;
    } catch (e) {
      console.warn('[restore] 云端覆盖部分失败，本地已恢复：', errMsg(e));
    }
  }

  return { ok: true, count: coupons.length, pushedToCloud };
}
