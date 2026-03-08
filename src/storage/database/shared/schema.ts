import { pgTable, varchar, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"
import { z } from "zod"

/**
 * 优惠券表
 * 与Neon数据库中已有的coupons表结构匹配
 */
export const coupons = pgTable("coupons", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  discountType: varchar("discount_type", { length: 20 }), // amount | percentage | full
  discountAmount: integer("discount_amount"),
  fullAmount: integer("full_amount"), // 满减门槛金额
  storeName: varchar("store_name", { length: 255 }), // 商家/品牌名称
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  endHour: integer("end_hour"), // 截止小时 0-23
  endMinute: integer("end_minute"), // 截止分钟 0-59
  isReminded: boolean("is_reminded").notNull().default(false),
  remindedDays: jsonb("reminded_days").$type<number[]>().default([]), // 已提醒的天数
  isUsed: boolean("is_used").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
})

// 类型定义
export type Coupon = typeof coupons.$inferSelect
export type InsertCoupon = typeof coupons.$inferInsert
export type UpdateCoupon = Partial<InsertCoupon>

// Zod schemas
export const insertCouponSchema = createInsertSchema(coupons, {
  id: z.string().min(1).max(36), // 不是uuid，是nanoid生成的字符串
  title: z.string().min(1, "标题不能为空").max(255),
  description: z.string().optional().nullable(),
  discountType: z.enum(["amount", "percentage", "full"]).optional().nullable(),
  discountAmount: z.number().int().positive().optional().nullable(),
  fullAmount: z.number().int().positive().optional().nullable(),
  storeName: z.string().max(255).optional().nullable(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  endHour: z.number().int().min(0).max(23).optional().nullable(),
  endMinute: z.number().int().min(0).max(59).optional().nullable(),
  isReminded: z.boolean().optional(),
  remindedDays: z.array(z.number()).optional(),
  isUsed: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  createdAt: z.coerce.date(), // 必填
  updatedAt: z.coerce.date().optional().nullable(),
})

export const updateCouponSchema = createSelectSchema(coupons, {
  id: z.string().uuid().optional(),
  title: z.string().min(1, "标题不能为空").max(255).optional(),
  description: z.string().optional().nullable(),
  discountType: z.enum(["amount", "percentage", "full"]).optional().nullable(),
  discountAmount: z.number().int().positive().optional().nullable(),
  fullAmount: z.number().int().positive().optional().nullable(),
  storeName: z.string().max(255).optional().nullable(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  endHour: z.number().int().min(0).max(23).optional().nullable(),
  endMinute: z.number().int().min(0).max(59).optional().nullable(),
  isReminded: z.boolean().optional(),
  remindedDays: z.array(z.number()).optional(),
  isUsed: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  updatedAt: z.coerce.date().optional().nullable(),
}).partial()
