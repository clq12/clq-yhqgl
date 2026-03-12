import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getCouponById,
  updateCoupon,
  deleteCoupon,
} from "@/lib/webdav-storage"
import { updateCouponSchema } from "@/storage/database/shared/schema"
import { toLocalISOString } from "@/lib/datetime-utils"

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

    // 处理endDate和endHour/endMinute
    const endHour = body.endHour ?? 23
    const endMinute = body.endMinute ?? 59

    // 处理日期：只存储日期部分（YYYY-MM-DD），时间由 endHour/endMinute 单独存储
    const extractDate = (dateValue: any): string | undefined => {
      if (!dateValue) return undefined
      if (dateValue instanceof Date) {
        return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}-${String(dateValue.getDate()).padStart(2, '0')}`
      }
      if (typeof dateValue === 'string') {
        // 如果带时间，只取日期部分
        if (dateValue.includes('T')) {
          return dateValue.split('T')[0]
        }
        // 如果带Z后缀，解析后提取日期
        if (dateValue.endsWith('Z')) {
          const d = new Date(dateValue)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        return dateValue
      }
      return undefined
    }

    const finalEndDate = extractDate(validated.endDate)

    // 添加所有新字段支持
    const updates = {
      ...validated,
      endDate: finalEndDate,
      endHour: endHour,
      endMinute: endMinute,
      ...(body.discountType !== undefined && { discountType: body.discountType || null }),
      ...(body.fullAmount !== undefined && { fullAmount: body.fullAmount || null }),
      ...(body.isUsed !== undefined && { isUsed: body.isUsed }),
      updatedAt: toLocalISOString(new Date()),
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
