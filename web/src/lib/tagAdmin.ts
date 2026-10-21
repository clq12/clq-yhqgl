import { beijingNow, normalizeTag, normalizeTags } from '../rules/couponRules';
import { listCoupons, putCoupon } from '../db/appDb';
import { bumpVersion } from '../sync/syncEngine';

/**
 * 标签改名 / 删除时，把已有优惠券上的标签一起改掉。
 *
 * 为什么必须做：标签是冗余在每张券上的（不是外键）。只改设置里的名单，
 * 券上留下的还是旧名字 —— 列表按标签筛选会出现「库里没有但筛得出来」的幽灵标签。
 *
 * 单条写失败（多半是乐观锁被拦下：这张券刚在别的设备上改过）不会中断整批，
 * 返回 skipped 让界面如实告诉用户「有几张没改成」。
 */
export interface TagRewriteResult {
  changed: number;
  skipped: number;
}

async function rewriteTags(
  matcher: (tags: string[]) => string[] | null,
): Promise<TagRewriteResult> {
  const coupons = await listCoupons();
  let changed = 0;
  let skipped = 0;

  for (const coupon of coupons) {
    const current = normalizeTags(coupon.tags ?? []);
    const next = matcher(current);
    if (!next) continue;
    if (next.length === current.length && next.every((t, i) => t === current[i])) continue;

    const now = beijingNow().toISOString();
    try {
      const withVersion = await bumpVersion({
        ...coupon,
        tags: next,
        updatedAt: now,
        modifiedAt: now,
      });
      await putCoupon(withVersion);
      changed += 1;
    } catch {
      skipped += 1;
    }
  }

  return { changed, skipped };
}

/** 旧标签 → 新标签；改名后与已有标签重复就合并 */
export async function renameTagOnCoupons(oldTag: string, newTag: string): Promise<TagRewriteResult> {
  const from = normalizeTag(oldTag);
  const to = normalizeTag(newTag);
  if (!from || !to || from === to) return { changed: 0, skipped: 0 };

  return rewriteTags((tags) => {
    if (!tags.includes(from)) return null;
    return normalizeTags(tags.map((t) => (t === from ? to : t)));
  });
}

/** 从所有券上摘掉某个标签 */
export async function removeTagFromCoupons(tag: string): Promise<TagRewriteResult> {
  const target = normalizeTag(tag);
  if (!target) return { changed: 0, skipped: 0 };
  return rewriteTags((tags) => (tags.includes(target) ? tags.filter((t) => t !== target) : null));
}

/** 删除前先告诉用户会影响多少张券，避免盲删 */
export async function countCouponsUsingTag(tag: string): Promise<number> {
  const target = normalizeTag(tag);
  if (!target) return 0;
  const coupons = await listCoupons();
  return coupons.filter((c) => normalizeTags(c.tags ?? []).includes(target)).length;
}
