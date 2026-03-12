import { pgTable, text, varchar, timestamp, boolean, integer, index } from "drizzle-orm/pg-core"
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
    discountAmount: integer("discount_amount"),
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

// TypeScript types
export type Coupon = typeof coupons.$inferSelect
export type InsertCoupon = z.infer<typeof insertCouponSchema>
export type UpdateCoupon = z.infer<typeof updateCouponSchema>




