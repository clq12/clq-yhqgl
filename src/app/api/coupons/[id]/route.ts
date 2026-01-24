import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getCouponById,
  updateCoupon,
  deleteCoupon,
} from "@/lib/webdav-storage"
import { updateCouponSchema } from "@/storage/database/shared/schema"

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

    initWebDAVClient(config)
    const coupon = await updateCoupon(id, validated as any)

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
