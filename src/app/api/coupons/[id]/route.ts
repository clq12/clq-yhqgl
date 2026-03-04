import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getCouponById,
  updateCoupon,
  deleteCoupon,
} from "@/lib/webdav-storage"
import { updateCouponSchema } from "@/storage/database/shared/schema"
import { setLocalTime } from "@/lib/datetime-utils"

// 获取单个优惠券
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const config = getWebDAVConfigFromRequest(request)

    if (!config) {
      return NextResponse.json(
        { success: false, error: "请先配置 WebDAV" },
        { status: 400 }
      )
    }

    initWebDAVClient(config)
    const coupon = await getCouponById(id)

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

// 更新优惠券
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const config = getWebDAVConfigFromRequest(request)

    if (!config) {
      return NextResponse.json(
        { success: false, error: "请先配置 WebDAV" },
        { status: 400 }
      )
    }

    const body = await request.json()

    // 验证数据
    const validated = updateCouponSchema.parse(body)

    // 处理endDate和endHour/endMinute（使用北京时间）
    const endHour = body.endHour ?? 23
    const endMinute = body.endMinute ?? 59

    let finalEndDate = validated.endDate

    // 如果endDate是Date对象，使用北京时间设置时间
    if (finalEndDate instanceof Date) {
      finalEndDate = setLocalTime(finalEndDate, endHour, endMinute, 59, 999)
    }

    // 添加所有新字段支持
    const updates = {
      ...validated,
      endDate: finalEndDate,
      endHour: endHour,
      endMinute: endMinute,
      ...(body.discountType !== undefined && { discountType: body.discountType || null }),
      ...(body.fullAmount !== undefined && { fullAmount: body.fullAmount || null }),
      ...(body.isUsed !== undefined && { isUsed: body.isUsed }),
      updatedAt: new Date().toISOString(),
    }

    initWebDAVClient(config)
    const coupon = await updateCoupon(id, updates as any)

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

// 删除优惠券
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const config = getWebDAVConfigFromRequest(request)

    if (!config) {
      return NextResponse.json(
        { success: false, error: "请先配置 WebDAV" },
        { status: 400 }
      )
    }

    initWebDAVClient(config)
    const success = await deleteCoupon(id)

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
