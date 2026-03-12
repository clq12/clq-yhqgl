import { pgTable, text, varchar, timestamp, boolean, integer, index, real } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { z } from "zod"

export const coupons = pgTable(
  "coupons",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    discountAmount: real("discount_amount"), // 支持浮点数
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    isReminded: boolean("is_reminded").default(false).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    endDateIdx: index("coupons_end_date_idx").on(table.endDate),
  })
)

// Zod schema for API 验证 - 接受字符串或 Date，在 API 层处理转换
export const insertCouponSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(255, "标题不能超过255个字符"),
  description: z.string().optional().nullable(),
  discountAmount: z.number().nullable().optional(),
  startDate: z.union([z.string(), z.date()]),
  endDate: z.union([z.string(), z.date()]),
  notes: z.string().optional().nullable(),
})

// Zod schema for 更新验证
export const updateCouponSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(255, "标题不能超过255个字符").optional(),
  description: z.string().optional().nullable(),
  discountAmount: z.number().nullable().optional(),
  startDate: z.union([z.string(), z.date()]).optional(),
  endDate: z.union([z.string(), z.date()]).optional(),
  isReminded: z.boolean().optional(),
  notes: z.string().optional().nullable(),
})

// 用于数据库操作的 schema（日期必须是 Date 或 SQL）
export const dbInsertCouponSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  discountAmount: z.number().nullable().optional(),
  startDate: z.date(),
  endDate: z.date(),
  notes: z.string().nullable().optional(),
})

// TypeScript types
export type Coupon = typeof coupons.$inferSelect
export type InsertCoupon = z.infer<typeof insertCouponSchema>
export type UpdateCoupon = z.infer<typeof updateCouponSchema>
export type DbInsertCoupon = z.infer<typeof dbInsertCouponSchema>




