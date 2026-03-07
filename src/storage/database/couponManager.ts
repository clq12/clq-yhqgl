import { eq, and, lte, gte, inArray, sql, desc } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { coupons, insertCouponSchema, updateCouponSchema } from "./shared/schema"
import type { Coupon, InsertCoupon, UpdateCoupon } from "./shared/schema"
import * as schema from "./shared/schema"

/**
 * 优惠券管理器
 * 使用 Neon PostgreSQL 数据库存储优惠券数据
 */
export class CouponManager {
  /**
   * 获取所有优惠券
   */
  async getAllCoupons(): Promise<Coupon[]> {
    const db = await getDb(schema)
    return db.select().from(coupons).orderBy(desc(coupons.createdAt))
  }

  /**
   * 获取单个优惠券
   */
  async getCouponById(id: string): Promise<Coupon | null> {
    const db = await getDb(schema)
    const [coupon] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1)
    return coupon || null
  }

  /**
   * 添加优惠券
   */
  async addCoupon(coupon: Omit<InsertCoupon, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<Coupon> {
    const db = await getDb(schema)
    
    const couponData = {
      ...coupon,
      id: coupon.id || crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: null,
    }
    
    const validated = insertCouponSchema.parse(couponData)
    const [created] = await db.insert(coupons).values(validated).returning()
    return created
  }

  /**
   * 更新优惠券
   */
  async updateCoupon(id: string, updates: UpdateCoupon): Promise<Coupon | null> {
    const db = await getDb(schema)
    const validated = updateCouponSchema.parse(updates)
    
    const [updated] = await db
      .update(coupons)
      .set({
        ...validated,
        updatedAt: new Date(),
      })
      .where(eq(coupons.id, id))
      .returning()
    
    return updated || null
  }

  /**
   * 删除优惠券
   */
  async deleteCoupon(id: string): Promise<boolean> {
    const db = await getDb(schema)
    const result = await db.delete(coupons).where(eq(coupons.id, id))
    return (result.rowCount ?? 0) > 0
  }

  /**
   * 批量删除优惠券
   */
  async deleteCoupons(ids: string[]): Promise<number> {
    const db = await getDb(schema)
    const result = await db.delete(coupons).where(inArray(coupons.id, ids))
    return result.rowCount ?? 0
  }

  /**
   * 批量更新优惠券状态
   */
  async bulkUpdateStatus(ids: string[], updates: { isUsed?: boolean; isReminded?: boolean }): Promise<number> {
    const db = await getDb(schema)
    
    const result = await db
      .update(coupons)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(inArray(coupons.id, ids))
    
    return result.rowCount ?? 0
  }

  /**
   * 获取即将到期的优惠券（精确到小时，使用北京时间 UTC+8）
   * @param hours 提前多少小时提醒
   */
  async getExpiringCouponsByHours(hours: number): Promise<Coupon[]> {
    const db = await getDb(schema)
    const now = new Date()
    const targetTime = new Date(now.getTime() + hours * 60 * 60 * 1000)

    const results = await db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.isUsed, false),
          lte(coupons.endDate, targetTime),
          gte(coupons.endDate, now)
        )
      )

    return results.filter((coupon) => {
      // 获取截止时间的小时和分钟
      const endHour = coupon.endHour ?? 23
      const endMinute = coupon.endMinute ?? 59

      // 构造完整的截止时间
      const endDate = new Date(coupon.endDate)
      endDate.setHours(endHour, endMinute, 0, 0)

      // 检查是否在指定时间范围内
      return endDate > now && endDate <= targetTime
    })
  }

  /**
   * 搜索优惠券
   */
  async searchCoupons(query: string): Promise<Coupon[]> {
    const db = await getDb(schema)
    return db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.isUsed, false),
          sql`title ILIKE ${`%${query}%`} OR description ILIKE ${`%${query}%`} OR store_name ILIKE ${`%${query}%`}`
        )
      )
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    total: number
    used: number
    unused: number
    expired: number
    expiringIn7Days: number
  }> {
    const db = await getDb(schema)
    const now = new Date()
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const allCoupons = await db.select().from(coupons)

    const total = allCoupons.length
    const used = allCoupons.filter((c) => c.isUsed).length
    const unused = allCoupons.filter((c) => !c.isUsed && new Date(c.endDate) > now).length
    const expired = allCoupons.filter((c) => !c.isUsed && new Date(c.endDate) <= now).length
    const expiringIn7Days = allCoupons.filter((c) => {
      if (c.isUsed) return false
      const endDate = new Date(c.endDate)
      return endDate > now && endDate <= sevenDaysLater
    }).length

    return { total, used, unused, expired, expiringIn7Days }
  }

  /**
   * 导出优惠券
   */
  async exportCoupons(filter: "all" | "used" | "unused" | "expired"): Promise<Coupon[]> {
    const db = await getDb(schema)
    const now = new Date()

    switch (filter) {
      case "all":
        return db.select().from(coupons)
      case "used":
        return db.select().from(coupons).where(eq(coupons.isUsed, true))
      case "unused": {
        const results = await db.select().from(coupons).where(eq(coupons.isUsed, false))
        return results.filter((c) => new Date(c.endDate) > now)
      }
      case "expired": {
        const results = await db.select().from(coupons).where(eq(coupons.isUsed, false))
        return results.filter((c) => new Date(c.endDate) <= now)
      }
      default:
        return db.select().from(coupons)
    }
  }

  /**
   * 导入优惠券
   */
  async importCoupons(
    couponList: Array<Omit<InsertCoupon, "id" | "createdAt" | "updatedAt">>,
    mode: "skip" | "overwrite" | "merge" = "skip"
  ): Promise<{ success: number; skipped: number; errors: string[] }> {
    const db = await getDb(schema)
    const errors: string[] = []
    let success = 0
    let skipped = 0

    const existingCoupons = await db.select().from(coupons)
    const existingTitles = new Set(existingCoupons.map((c) => c.title))

    for (const couponData of couponList) {
      try {
        // 检查是否已存在
        const exists = existingTitles.has(couponData.title || "")

        if (exists && mode === "skip") {
          skipped++
          continue
        }

        if (exists && mode === "overwrite") {
          // 找到并更新
          const existing = existingCoupons.find((c) => c.title === couponData.title)
          if (existing) {
            await this.updateCoupon(existing.id, couponData as UpdateCoupon)
            success++
          }
          continue
        }

        // 创建新优惠券
        await this.addCoupon(couponData)
        success++
      } catch (error) {
        errors.push(`导入失败: ${couponData.title} - ${error}`)
      }
    }

    return { success, skipped, errors }
  }
}

export const couponManager = new CouponManager()

// 兼容性导出：保持与 WebDAV 存储相同的接口
export type { Coupon, InsertCoupon, UpdateCoupon }
