import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getAllCoupons,
  addCoupon,
} from "@/lib/webdav-storage"
import { insertCouponSchema } from "@/storage/database/shared/schema"

/**
 * 从环境变量获取配置（用于定时任务）
 */
function getConfigFromEnv(): WebDAVConfig | null {
  const {
    WEBDAV_URL,
    WEBDAV_USERNAME,
    WEBDAV_PASSWORD,
  } = process.env

  if (WEBDAV_URL && WEBDAV_USERNAME && WEBDAV_PASSWORD) {
    const config: WebDAVConfig = {
      url: WEBDAV_URL,
      username: WEBDAV_USERNAME,
      password: WEBDAV_PASSWORD,
    }

    return config
  }

  return null
}

// 获取优惠券列表
export async function GET(request: NextRequest) {
  try {
    let config = getConfigFromEnv()

    if (!config) {
      config = getWebDAVConfigFromRequest(request)
    }

    if (!config) {
      return NextResponse.json(
        { success: false, error: "请先配置 WebDAV" },
        { status: 400 }
      )
    }

    // 初始化 WebDAV 客户端
    initWebDAVClient(config)

    const coupons = await getAllCoupons()

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
    let config = getConfigFromEnv()

    if (!config) {
      config = getWebDAVConfigFromRequest(request)
    }

    if (!config) {
      return NextResponse.json(
        { success: false, error: "请先配置 WebDAV" },
        { status: 400 }
      )
    }

    const body = await request.json()

    // 验证数据
    const validated = insertCouponSchema.parse(body)

    // 处理endDate和endHour/endMinute
    let finalEndDate = validated.endDate

    // 如果endDate是Date对象，根据endHour和endMinute设置时间
    if (finalEndDate instanceof Date) {
      // 使用endHour和endMinute设置时间
      const endHour = body.endHour ?? 23
      const endMinute = body.endMinute ?? 59

      // 创建新的Date对象，使用endHour和endMinute
      finalEndDate = new Date(finalEndDate)
      finalEndDate.setHours(endHour, endMinute, 59, 999) // 设置到秒和毫秒
    }

    // 创建优惠券对象
    const coupon = {
      ...validated,
      endDate: finalEndDate,
      endHour: body.endHour ?? 23, // 默认23点
      endMinute: body.endMinute ?? 59, // 默认59分
      discountType: body.discountType || null,
      fullAmount: body.fullAmount || null,
      id: crypto.randomUUID(),
      isReminded: false,
      isUsed: false, // 默认未使用
      remindedDays: [], // 初始化提醒天数数组
      createdAt: new Date().toISOString(),
      updatedAt: null,
    }

    // 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 保存到 WebDAV
    await addCoupon(coupon as any)

    return NextResponse.json({ success: true, data: coupon }, { status: 201 })
  } catch (error) {
    console.error("创建优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "创建优惠券失败" },
      { status: 500 }
    )
  }
}
