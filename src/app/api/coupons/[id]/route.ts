import { NextRequest, NextResponse } from "next/server"
import { couponManager } from "@/storage/database"

/**
 * 获取单个优惠券
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const coupon = await couponManager.getCouponById(id)
    
    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "优惠券不存在" },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ success: true, data: coupon })
  } catch (error) {
    console.error("获取优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "获取优惠券失败" },
      { status: 500 }
    )
  }
}

/**
 * 更新优惠券
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const updates: Record<string, unknown> = {}

    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description
    if (body.discountType !== undefined) updates.discountType = body.discountType
    if (body.discountAmount !== undefined) updates.discountAmount = body.discountAmount
    if (body.fullAmount !== undefined) updates.fullAmount = body.fullAmount
    if (body.storeName !== undefined) updates.storeName = body.storeName
    if (body.brand !== undefined) updates.storeName = body.brand || null // 兼容前端
    if (body.notes !== undefined) updates.notes = body.notes
    if (body.isUsed !== undefined) updates.isUsed = body.isUsed
    if (body.isReminded !== undefined) updates.isReminded = body.isReminded
    if (body.remindedDays !== undefined) updates.remindedDays = body.remindedDays

    if (body.startDate !== undefined) {
      updates.startDate = new Date(body.startDate)
    }
    if (body.endDate !== undefined) {
      updates.endDate = new Date(body.endDate)
    }
    if (body.endHour !== undefined) updates.endHour = body.endHour
    if (body.endMinute !== undefined) updates.endMinute = body.endMinute

    const coupon = await couponManager.updateCoupon(id, updates)
    
    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "优惠券不存在" },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ success: true, data: coupon })
  } catch (error) {
    console.error("更新优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "更新优惠券失败" },
      { status: 500 }
    )
  }
}

/**
 * 删除优惠券
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const success = await couponManager.deleteCoupon(id)
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: "优惠券不存在" },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("删除优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "删除优惠券失败" },
      { status: 500 }
    )
  }
}
