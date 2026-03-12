import { eq, and, lte, SQL, sql } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import {
  coupons,
  insertCouponSchema,
  updateCouponSchema,
  type Coupon,
  type InsertCoupon,
  type UpdateCoupon,
} from "./shared/schema"

export class CouponManager {
  async createCoupon(data: InsertCoupon): Promise<Coupon> {
    const db = await getDb()
    const validated = insertCouponSchema.parse(data)
    const [coupon] = await db.insert(coupons).values(validated).returning()
    return coupon
  }

  async getCoupons(options: {
    skip?: number
    limit?: number
    filters?: Partial<Pick<Coupon, "isReminded">>
    expiringInDays?: number
  } = {}): Promise<Coupon[]> {
    const { skip = 0, limit = 100, filters = {}, expiringInDays } = options
    const db = await getDb()

    const conditions: SQL[] = []

    // 过滤已提醒状态
    if (filters.isReminded !== undefined) {
      conditions.push(eq(coupons.isReminded, filters.isReminded))
    }

    // 查找即将到期的优惠券
    if (expiringInDays !== undefined) {
      const now = new Date()
      const futureDate = new Date(now.getTime() + expiringInDays * 24 * 60 * 60 * 1000)
      conditions.push(
        sql`${coupons.endDate} >= ${now} AND ${coupons.endDate} <= ${futureDate}`
      )
    }

    if (conditions.length > 0) {
      return db
        .select()
        .from(coupons)
        .where(and(...conditions))
        .orderBy(coupons.endDate)
        .limit(limit)
        .offset(skip)
    }

    return db
      .select()
      .from(coupons)
      .orderBy(coupons.endDate)
      .limit(limit)
      .offset(skip)
  }

  async getCouponById(id: string): Promise<Coupon | null> {
    const db = await getDb()
    const [coupon] = await db.select().from(coupons).where(eq(coupons.id, id))
    return coupon || null
  }

  async updateCoupon(id: string, data: UpdateCoupon): Promise<Coupon | null> {
    const db = await getDb()
    const validated = updateCouponSchema.parse(data)
    const [coupon] = await db
      .update(coupons)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(coupons.id, id))
      .returning()
    return coupon || null
  }

  async deleteCoupon(id: string): Promise<boolean> {
    const db = await getDb()
    const result = await db.delete(coupons).where(eq(coupons.id, id))
    return (result.rowCount ?? 0) > 0
  }

  async markAsReminded(id: string): Promise<Coupon | null> {
    return this.updateCoupon(id, { isReminded: true })
  }

  async getActiveCoupons(): Promise<Coupon[]> {
    const db = await getDb()
    const now = new Date()
    return db
      .select()
      .from(coupons)
      .where(sql`${coupons.endDate} >= ${now}`)
      .orderBy(coupons.endDate)
  }

  async getExpiredCoupons(): Promise<Coupon[]> {
    const db = await getDb()
    const now = new Date()
    return db
      .select()
      .from(coupons)
      .where(lte(coupons.endDate, now))
      .orderBy(sql`${coupons.endDate} DESC`)
  }
}

export const couponManager = new CouponManager()
