import { eq, and, or, lte, gte, inArray, sql, desc } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { coupons, insertCouponSchema, updateCouponSchema } from "./shared/schema"
import type { Coupon, InsertCoupon, UpdateCoupon } from "./shared/schema"
import * as schema from "./shared/schema"
import { nanoid } from "nanoid"

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
    return db
      .select()
      .from(coupons)
      .orderBy(desc(coupons.createdAt))
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
  async addCoupon(coupon: Omit<InsertCoupon, "id" | "createdAt" | "updatedAt">): Promise<Coupon> {
    const db = await getDb(schema)
    
    const couponData = {
      id: nanoid(), // 生成唯一ID
      ...coupon,
      createdAt: new Date(),
      updatedAt: new Date(),
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
    const [deleted] = await db.delete(coupons).where(eq(coupons.id, id)).returning()
    return !!deleted
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
  async bulkUpdateStatus(ids: string[], updates: { isUsed?: boolean }): Promise<number> {
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
   * 获取即将到期的优惠券
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
      const endHour = coupon.endHour ?? 23
      const endMinute = coupon.endMinute ?? 59

      const endDate = new Date(coupon.endDate!)
      endDate.setHours(endHour, endMinute, 0, 0)

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
          sql`(title ILIKE ${`%${query}%`} OR description ILIKE ${`%${query}%`} OR store_name ILIKE ${`%${query}%`})`
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
    const unused = allCoupons.filter((c) => !c.isUsed && c.endDate && new Date(c.endDate) > now).length
    const expired = allCoupons.filter((c) => !c.isUsed && c.endDate && new Date(c.endDate) <= now).length
    const expiringIn7Days = allCoupons.filter((c) => {
      if (c.isUsed || !c.endDate) return false
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
        return results.filter((c) => c.endDate && new Date(c.endDate) > now)
      }
      case "expired": {
        const results = await db.select().from(coupons).where(eq(coupons.isUsed, false))
        return results.filter((c) => c.endDate && new Date(c.endDate) <= now)
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
        const exists = existingTitles.has(couponData.title || "")

        if (exists && mode === "skip") {
          skipped++
          continue
        }

        if (exists && mode === "overwrite") {
          const existing = existingCoupons.find((c) => c.title === couponData.title)
          if (existing) {
            await this.updateCoupon(existing.id, couponData as UpdateCoupon)
            success++
          }
          continue
        }

        const couponToAdd = {
          id: nanoid(), // 生成唯一ID
          ...couponData,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        const validated = insertCouponSchema.parse(couponToAdd)
        await db.insert(coupons).values(validated)
        success++
      } catch (error) {
        console.error("导入优惠券失败:", error)
        errors.push(`${couponData.title}: ${error instanceof Error ? error.message : "未知错误"}`)
      }
    }

    return { success, skipped, errors }
  }
}

// 导出单例
export const couponManager = new CouponManager()
