/**
 * 版本标记（`version = { deviceId, counter }`）。
 *
 * 只回答「这条改动是哪台设备第几次写的」，给排障和冲突提示提供线索；
 * **不参与冲突判定** —— v3 的乐观锁比的是 `modified_at`（见 `sync/decideWrite.ts`）。
 *
 * 说明：这个函数原本住在 `syncEngine.ts` 里。那份 WebDAV 三向合并整体废弃后，
 * 它是唯一还在被引用的导出（AIPanel / CouponDetail / CouponForm / lib/tagAdmin
 * 写完券都要盖章），所以单独搬到这里，别再跟着死代码一起被删。
 */
import type { Coupon } from '../types/coupon';

const DEVICE_KEY = 'yhqgl-device-id';

/** 本机设备标识；首次调用生成并记住（localStorage 不可用时退化为临时 id） */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `web-${crypto.randomUUID()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'web-unknown';
  }
}

/**
 * 写券前盖章：counter +1，`modifiedAt` / `updatedAt` 推到当前时刻。
 *
 * 保持 async 签名是为了兼容既有调用点的 `await bumpVersion(...)`。
 */
export async function bumpVersion(coupon: Coupon): Promise<Coupon> {
  const time = new Date().toISOString();
  return {
    ...coupon,
    version: { deviceId: deviceId(), counter: (coupon.version?.counter || 0) + 1 },
    modifiedAt: time,
    updatedAt: time,
  };
}
