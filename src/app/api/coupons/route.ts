import { NextRequest, NextResponse } from "next/server"
import { couponManager } from "@/storage/database"
import { insertCouponSchema } from "@/storage/database/shared/schema"
import { setLocalTime } from "@/lib/datetime-utils"

// 获取优惠券列表
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

// 创建优惠券
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = insertCouponSchema.parse(body)

    const endHour = body.endHour ?? 23
    const endMinute = body.endMinute ?? 59

    let finalEndDate = validated.endDate

    if (finalEndDate instanceof Date) {
      finalEndDate = setLocalTime(finalEndDate, endHour, endMinute, 59, 999)
    }

    const couponData = {
      ...validated,
      endDate: finalEndDate,
      endHour,
      endMinute,
      discountType: body.discountType || null,
      fullAmount: body.fullAmount || null,
      storeName: body.storeName || null,
      isUsed: false,
      isReminded: false,
      remindedDays: [],
      notes: body.notes || null,
    }

    const coupon = await couponManager.addCoupon(couponData)

    return NextResponse.json({ success: true, data: coupon }, { status: 201 })
  } catch (error) {
    console.error("创建优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "创建优惠券失败" },
      { status: 500 }
    )
  }
}
