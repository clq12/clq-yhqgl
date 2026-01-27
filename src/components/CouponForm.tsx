"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, ScanText } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import type { Coupon } from "@/lib/webdav-storage"
import OcrCouponRecognizer, { type ExtractedCouponInfo } from "./OcrCouponRecognizer"

const couponSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(255, "标题不能超过255个字符"),
  description: z.string().optional(),
  discountType: z.enum(['amount', 'percentage', 'full']).nullable().optional(), // 折扣类型
  discountAmount: z.number().optional(), // 折扣金额或折扣比例
  fullAmount: z.number().optional(), // 满减中的满金额
  startDate: z.date({ message: "开始日期不能为空" }),
  endDate: z.date({ message: "截止日期不能为空" }),
  endHour: z.number().min(0).max(23).nullable().optional(), // 截止小时，0-23，null表示23点
  notes: z.string().optional(),
}).refine((data) => data.endDate >= data.startDate, {
  message: "截止日期必须晚于或等于开始日期",
  path: ["endDate"],
}).refine((data) => {
  // 如果选择满减，必须提供满金额和减免金额
  if (data.discountType === 'full') {
    return data.fullAmount !== undefined && data.fullAmount > 0 && data.discountAmount !== undefined && data.discountAmount > 0
  }
  // 如果选择减免或折扣，必须提供金额
  if (data.discountType === 'amount' || data.discountType === 'percentage') {
    return data.discountAmount !== undefined && data.discountAmount > 0
  }
  return true
}, {
  message: "请完整填写折扣信息",
  path: ["discountAmount"],
})

type CouponFormData = z.infer<typeof couponSchema>

interface CouponFormProps {
  coupon?: Coupon | null
  onSubmit: (data: CouponFormData) => void
  onCancel: () => void
}

export default function CouponForm({ coupon, onSubmit, onCancel }: CouponFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showOcr, setShowOcr] = useState(false)

  const form = useForm<CouponFormData>({
    resolver: zodResolver(couponSchema),
    defaultValues: coupon
      ? {
          title: coupon.title,
          description: coupon.description || "",
          discountType: (coupon as any).discountType || null,
          discountAmount: coupon.discountAmount || undefined,
          fullAmount: (coupon as any).fullAmount || undefined,
          startDate: new Date(coupon.startDate),
          endDate: new Date(coupon.endDate),
          endHour: (coupon as any).endHour ?? 23, // 默认23点
          notes: coupon.notes || "",
        }
      : {
          title: "",
          description: "",
          discountType: null,
          discountAmount: undefined,
          fullAmount: undefined,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 默认30天后
          endHour: 23, // 默认23点
          notes: "",
        },
  })

  const handleSubmit = async (data: CouponFormData) => {
    try {
      setIsSubmitting(true)
      await onSubmit(data)
    } catch (error) {
      console.error("提交失败:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 处理OCR识别结果
  const handleOcrExtracted = (info: ExtractedCouponInfo) => {
    // 填充表单字段
    if (info.title) form.setValue('title', info.title)
    if (info.description) form.setValue('description', info.description)
    if (info.discountType) form.setValue('discountType', info.discountType)
    if (info.discountAmount !== undefined) form.setValue('discountAmount', info.discountAmount)
    if (info.fullAmount !== undefined) form.setValue('fullAmount', info.fullAmount)
    if (info.endDate) form.setValue('endDate', new Date(info.endDate))
    if (info.endHour !== undefined) form.setValue('endHour', info.endHour)
    if (info.notes) form.setValue('notes', info.notes)

    // 关闭OCR组件
    setShowOcr(false)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* OCR识别按钮 */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowOcr(!showOcr)}
            className="gap-2"
          >
            <ScanText className="h-4 w-4" />
            {showOcr ? '关闭OCR' : 'OCR识别'}
          </Button>
        </div>

        {/* OCR识别组件 */}
        {showOcr && (
          <div className="mb-4">
            <OcrCouponRecognizer
              onExtracted={handleOcrExtracted}
              onCancel={() => setShowOcr(false)}
            />
          </div>
        )}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>标题</FormLabel>
              <FormControl>
                <Input placeholder="例如：星巴克5折优惠" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>描述（可选）</FormLabel>
              <FormControl>
                <Textarea placeholder="简要描述优惠内容" {...field} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 折扣信息 */}
        <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
          <FormField
            control={form.control}
            name="discountType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>折扣类型（可选）</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const value = e.target.value
                      field.onChange(value === "" ? null : value)
                      // 清空相关字段
                      if (value === "") {
                        form.setValue("discountAmount", undefined)
                        form.setValue("fullAmount", undefined)
                      }
                    }}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">不设置折扣</option>
                    <option value="amount">减免金额</option>
                    <option value="percentage">折扣比例</option>
                    <option value="full">满减优惠</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fullAmount"
            render={({ field }) => {
              const discountType = form.watch("discountType")
              if (discountType !== "full") return <></>

              return (
                <FormItem>
                  <FormLabel>满金额</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="例如：100（满100）"
                      {...field}
                      onChange={(e) => {
                        const value = e.target.value
                        field.onChange(value === "" ? undefined : parseFloat(value))
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )
            }}
          />

          <FormField
            control={form.control}
            name="discountAmount"
            render={({ field }) => {
              const discountType = form.watch("discountType")

              if (!discountType) return <></>

              const placeholder = {
                amount: "例如：20（减20元）",
                percentage: "例如：5（5折）",
                full: "例如：20（减20元）"
              }[discountType]

              const label = {
                amount: "减免金额",
                percentage: "折扣比例",
                full: "减免金额"
              }[discountType]

              return (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder={placeholder}
                      {...field}
                      onChange={(e) => {
                        const value = e.target.value
                        field.onChange(value === "" ? undefined : parseFloat(value))
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>开始日期</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "yyyy-MM-dd")
                        ) : (
                          <span>选择日期</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < new Date("1900-01-01")}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>截止日期</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "yyyy-MM-dd")
                        ) : (
                          <span>选择日期</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < new Date("1900-01-01")}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="endHour"
          render={({ field }) => (
            <FormItem>
              <FormLabel>截止小时</FormLabel>
              <FormControl>
                <select
                  {...field}
                  onChange={(e) => {
                    const value = e.target.value
                    field.onChange(value === "" ? 23 : parseInt(value))
                  }}
                  value={field.value ?? 23}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}点
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>备注（可选）</FormLabel>
              <FormControl>
                <Textarea placeholder="添加其他备注信息" {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            取消
          </Button>
          <Button type="submit" disabled={isSubmitting} className="flex-1">
            {isSubmitting ? "保存中..." : "保存"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
