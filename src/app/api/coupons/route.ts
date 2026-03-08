import { NextRequest, NextResponse } from "next/server"
import { couponManager } from "@/storage/database"
import { setLocalTime } from "@/lib/datetime-utils"

/**
 * 获取优惠券列表
 */
export async function GET() {
  try {
    const coupons = await couponManager.getAllCoupons()
    return NextResponse.json({ success: true, data: coupons })
  } catch (error) {
    console.error("获取优惠券列表失败:", error)
    return NextResponse.json(
      { success: false, error: "获取优惠券列表失败" },
      { status: 500 }
    )
  }
}

/**
 * 创建优惠券
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('创建优惠券请求:', body)

    // 处理结束时间
    const endHour = body.endHour ?? 23
    const endMinute = body.endMinute ?? 59

    // 处理日期
    let startDate = body.startDate ? new Date(body.startDate) : new Date()
    let endDate = body.endDate ? new Date(body.endDate) : new Date()

    // 设置结束时间
    if (endDate instanceof Date) {
      endDate = setLocalTime(endDate, endHour, endMinute, 59, 999)
    }

    const couponData = {
      title: body.title || '',
      description: body.description || null,
      discountType: body.discountType || 'amount',
      discountAmount: body.discountAmount || null,
      fullAmount: body.fullAmount || null,
      storeName: body.storeName || body.brand || null, // 兼容前端两种字段名
      startDate,
      endDate,
      endHour,
      endMinute,
      notes: body.notes || null,
      isUsed: body.isUsed ?? false,
      isReminded: false,
      remindedDays: [],
    }

    const coupon = await couponManager.addCoupon(couponData)
    return NextResponse.json({ success: true, data: coupon })
  } catch (error) {
    console.error("创建优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "创建优惠券失败" },
      { status: 500 }
    )
  }
}
