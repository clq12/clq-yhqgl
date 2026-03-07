import { NextRequest, NextResponse } from "next/server"
import { couponManager } from "@/storage/database"
import { setLocalTime, formatLocalDate } from "@/lib/datetime-utils"

/**
 * 导入优惠券
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { coupons, mode } = body // mode: 'skip' | 'overwrite' | 'merge'

    if (!coupons || !Array.isArray(coupons) || coupons.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供要导入的优惠券数据" },
        { status: 400 }
      )
    }

    // 处理优惠券数据
    const processedCoupons = coupons.map((c: any) => {
      // 处理日期
      const endHour = c.endHour ?? 23
      const endMinute = c.endMinute ?? 59
      let startDate = c.startDate ? new Date(c.startDate) : new Date()
      let endDate = c.endDate ? new Date(c.endDate) : new Date()

      // 如果endDate是Date对象，设置结束时间
      if (endDate instanceof Date) {
        endDate = setLocalTime(endDate, endHour, endMinute, 59, 999)
      }

      return {
        title: c.title || '',
        description: c.description || null,
        discountType: c.discountType || 'amount',
        discountAmount: c.discountAmount || null,
        fullAmount: c.fullAmount || null,
        storeName: c.storeName || null,
        startDate,
        endDate,
        endHour,
        endMinute,
        notes: c.notes || null,
        isUsed: c.isUsed ?? false,
        isReminded: false,
        remindedDays: c.remindedDays || [],
      }
    })

    // 使用 couponManager 导入优惠券
    const result = await couponManager.importCoupons(processedCoupons, mode || "skip")

    return NextResponse.json({
      success: true,
      message: `成功导入 ${result.success} 个优惠券${result.skipped > 0 ? `，跳过了 ${result.skipped} 个重复项` : ''}`,
      data: {
        importedCount: result.success,
        skippedCount: result.skipped,
        errors: result.errors,
      }
    })
  } catch (error) {
    console.error("导入优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "导入优惠券失败" },
      { status: 500 }
    )
  }
}
