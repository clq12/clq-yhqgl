import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getAllCoupons,
  addCoupon,
} from "@/lib/webdav-storage"
import { insertCouponSchema } from "@/storage/database/shared/schema"
import { safeCreateDate, setLocalTime, toLocalISOString } from "@/lib/datetime-utils"

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
    
    console.log('=== 创建优惠券 API ===')
    console.log('收到的body:', JSON.stringify(body, null, 2))

    const validated = insertCouponSchema.parse(body)
    
    console.log('validated:', validated)

    const endHour = body.endHour ?? 23
    const endMinute = body.endMinute ?? 59

    let finalEndDate = validated.endDate

    if (finalEndDate instanceof Date) {
      finalEndDate = setLocalTime(finalEndDate, endHour, endMinute, 59, 999)
    }

    const coupon = {
      ...validated,
      endDate: finalEndDate,
      endHour: endHour,
      endMinute: endMinute,
      discountType: body.discountType || null,
      fullAmount: body.fullAmount || null,
      id: crypto.randomUUID(),
      isReminded: false,
      isUsed: false,
      remindedDays: [],
      createdAt: toLocalISOString(new Date()),
      updatedAt: null,
    }
    
    console.log('最终coupon:', JSON.stringify(coupon, null, 2))

    initWebDAVClient(config)
    
    try {
      await addCoupon(coupon as any)
    } catch (addError: any) {
      console.error('addCoupon具体错误:', addError)
      return NextResponse.json(
        { success: false, error: `WebDAV写入失败: ${addError?.message || '未知错误'}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: coupon }, { status: 201 })
  } catch (error: any) {
    console.error("创建优惠券失败:", error)
    const errorMessage = error?.message || '创建优惠券失败'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}