import { pgTable, text, varchar, timestamp, boolean, integer, index, real } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"

export const coupons = pgTable(
  "coupons",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    discountAmount: real("discount_amount"), // 改为 real 支持浮点数
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

// 使用 createSchemaFactory 配置 date coercion
const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({
  coerce: { date: true },
})

// Zod schemas for validation
export const insertCouponSchema = createCoercedInsertSchema(coupons).pick({
  title: true,
  description: true,
  discountAmount: true,
  startDate: true,
  endDate: true,
  notes: true,
}).extend({
  // 覆盖 discountAmount，允许数字或null，支持浮点数
  discountAmount: z.number().nullable().optional(),
})

export const updateCouponSchema = createCoercedInsertSchema(coupons)
  .pick({
    title: true,
    description: true,
    discountAmount: true,
    startDate: true,
    endDate: true,
    isReminded: true,
    notes: true,
  })
  .partial()
  .extend({
    // 覆盖 discountAmount，允许数字或null，支持浮点数
    discountAmount: z.number().nullable().optional(),
  })

// TypeScript types
export type Coupon = typeof coupons.$inferSelect
export type InsertCoupon = z.infer<typeof insertCouponSchema>
export type UpdateCoupon = z.infer<typeof updateCouponSchema>




