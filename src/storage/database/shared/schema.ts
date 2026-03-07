import { pgTable, index, varchar, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"

export const coupons = pgTable("coupons", {
  id: varchar({ length: 36 })
    .default(sql`gen_random_uuid()`)
    .primaryKey()
    .notNull(),
  title: varchar({ length: 255 }).notNull(),
  description: text(),
  // 折扣类型: amount-减免金额, percentage-折扣, full-满减
  discountType: varchar("discount_type", { length: 20 }),
  discountAmount: integer("discount_amount"),
  fullAmount: integer("full_amount"),
  storeName: varchar("store_name", { length: 255 }),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  endHour: integer("end_hour").default(23),
  endMinute: integer("end_minute").default(59),
  isUsed: boolean("is_used").default(false).notNull(),
  isReminded: boolean("is_reminded").default(false).notNull(),
  remindedDays: jsonb("reminded_days").default([]).$type<number[]>(),
  notes: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("coupons_end_date_idx").using("btree", table.endDate.asc().nullsLast().op("timestamptz_ops")),
]);

// 使用 createSchemaFactory 配置 date coercion（处理前端 string → Date 转换）
const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({
  coerce: { date: true }
});

// Zod schemas for validation
export const insertCouponSchema = createCoercedInsertSchema(coupons).pick({
  title: true,
  description: true,
  discountType: true,
  discountAmount: true,
  fullAmount: true,
  storeName: true,
  startDate: true,
  endDate: true,
  endHour: true,
  endMinute: true,
  isUsed: true,
  notes: true,
});

export const updateCouponSchema = createCoercedInsertSchema(coupons)
  .pick({
    title: true,
    description: true,
    discountType: true,
    discountAmount: true,
    fullAmount: true,
    storeName: true,
    startDate: true,
    endDate: true,
    endHour: true,
    endMinute: true,
    isUsed: true,
    isReminded: true,
    remindedDays: true,
    notes: true,
  })
  .partial();

// TypeScript types
export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type UpdateCoupon = z.infer<typeof updateCouponSchema>;
