/**
 * 手动备份：把本地优惠券一次性导出到用户配置的 WebDAV 网盘。
 *
 * 这是 v3 下 WebDAV 的唯一用途——可选的「一键手动备份」出口，不参与设备间同步。
 * 设备间同步请走云端（见 src/db/appDb.ts）。导出为单向动作：读本地、写远程，
 * 不读回、不合并，避免与云端真相源产生歧义。
 */
import type { AppSettings } from '../types/coupon';
import * as localDB from '../db/indexedDB';
import { WebDAVClient } from './webdav';

const BACKUP_PATH = 'data.json';

export interface BackupResult {
  ok: boolean;
  error?: string;
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
  } catch (e) {
    return { ok: false, error: '创建根目录失败：' + errMsg(e) };
  }

  const coupons = (await localDB.listCoupons()).filter((c) => !c.deletedAt);
  const payload = {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    note: 'v3 手动备份，仅导出本地数据；设备间同步请使用云端',
    coupons,
  };

  let ok = false;
  try {
    ok = await client.put(BACKUP_PATH, JSON.stringify(payload, null, 2));
  } catch (e) {
    return { ok: false, error: '写入备份文件失败：' + errMsg(e) };
  }

  if (!ok) {
    return { ok: false, error: '写入备份文件失败' };
  }
  return { ok: true };
}
