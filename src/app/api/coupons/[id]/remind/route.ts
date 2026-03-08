import { NextRequest, NextResponse } from "next/server"
import { couponManager } from "@/storage/database"

/**
 * 更新优惠券提醒状态
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { isReminded, remindedDays } = body

    const updates: { isReminded?: boolean; remindedDays?: number[] } = {}
    
    if (typeof isReminded === 'boolean') {
      updates.isReminded = isReminded
    }
    
    if (Array.isArray(remindedDays)) {
      updates.remindedDays = remindedDays
    }

    const coupon = await couponManager.updateCoupon(id, updates)
    
    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "优惠券不存在" },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ success: true, data: coupon })
  } catch (error) {
    console.error("更新提醒状态失败:", error)
    return NextResponse.json(
      { success: false, error: "更新提醒状态失败" },
      { status: 500 }
    )
  }
}
