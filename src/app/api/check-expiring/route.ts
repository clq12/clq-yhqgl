import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getAllCoupons,
  saveCoupons,
  Coupon,
} from "@/lib/webdav-storage"
import { sendPushPlus, generateExpiringMessage } from "@/lib/pushplus"

/**
 * 计算优惠券剩余天数
 */
function getDaysRemaining(coupon: any): number {
  const now = new Date()
  const endDate = new Date(coupon.endDate)

  // 设置截止时间的小时
  const endHour = coupon.endHour ?? 23
  endDate.setHours(endHour, 0, 0, 0)

  const diffMs = endDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

/**
 * 计算优惠券剩余小时数
 */
function getRemainingHours(coupon: any): number {
  const now = new Date()
  const endDate = new Date(coupon.endDate)

  // 设置截止时间的小时
  const endHour = coupon.endHour ?? 23
  endDate.setHours(endHour, 0, 0, 0)

  const diffMs = endDate.getTime() - now.getTime()
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))
  return Math.max(0, diffHours)
}

/**
 * 从环境变量获取配置（用于定时任务）
 */
function getConfigFromEnv(): WebDAVConfig | null {
  const {
    WEBDAV_URL,
    WEBDAV_USERNAME,
    WEBDAV_PASSWORD,
    PUSHPLUS_TOKEN,
  } = process.env

  if (WEBDAV_URL && WEBDAV_USERNAME && WEBDAV_PASSWORD) {
    const config: WebDAVConfig = {
      url: WEBDAV_URL,
      username: WEBDAV_USERNAME,
      password: WEBDAV_PASSWORD,
    }

    if (PUSHPLUS_TOKEN) {
      config.pushplusToken = PUSHPLUS_TOKEN
    }

    return config
  }

  return null
}

// 检查即将到期的优惠券并发送推送
export async function GET(request: NextRequest) {
  try {
    // 1. 获取配置（优先从环境变量，其次从 Cookie）
    let config = getConfigFromEnv()

    if (!config) {
      config = getWebDAVConfigFromRequest(request)
    }

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: "请先配置 WebDAV（通过应用界面或环境变量）",
          hint: "定时任务需要配置环境变量：WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD, PUSHPLUS_TOKEN",
        },
        { status: 401 }
      )
    }

    if (!config.pushplusToken) {
      return NextResponse.json(
        {
          success: false,
          error: "请先配置 PushPlus Token（通过应用界面或环境变量 PUSHPLUS_TOKEN）",
        },
        { status: 400 }
      )
    }

    // 2. 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 3. 获取所有优惠券
    const allCoupons = await getAllCoupons()

    // 4. 新的提醒逻辑：允许重复推送
    // 检查所有未使用的优惠券，根据剩余时间分组推送
    let totalSent = 0
    const now = new Date()

    // 按剩余天数分组
    const within7Days: Coupon[] = []
    const within3Days: Coupon[] = []
    const within1Day: Coupon[] = []

    for (const coupon of allCoupons) {
      // 排除已使用的优惠券
      if (coupon.isUsed) {
        continue
      }

      // 计算剩余天数
      const days = getDaysRemaining(coupon)
      const hours = getRemainingHours(coupon)

      // 分组：允许重复推送
      if (days <= 7) {
        within7Days.push(coupon)
      }
      if (days <= 3) {
        within3Days.push(coupon)
      }
      if (days <= 1) {
        within1Day.push(coupon)
      }
    }

    // 5. 按天分组发送推送
    // 7天内到期
    if (within7Days.length > 0) {
      const message = generateExpiringMessage(within7Days, 7)
      const success = await sendPushPlus({
        token: config.pushplusToken,
        title: `优惠券即将到期提醒（7天内）`,
        content: message,
        template: "html",
      })
      if (success) {
        totalSent += within7Days.length
      }
    }

    // 3天内到期
    if (within3Days.length > 0) {
      const message = generateExpiringMessage(within3Days, 3)
      const success = await sendPushPlus({
        token: config.pushplusToken,
        title: `优惠券即将到期提醒（3天内）`,
        content: message,
        template: "html",
      })
      if (success) {
        totalSent += within3Days.length
      }
    }

    // 1天内到期
    if (within1Day.length > 0) {
      const message = generateExpiringMessage(within1Day, 1)
      const success = await sendPushPlus({
        token: config.pushplusToken,
        title: `优惠券即将到期提醒（1天内）`,
        content: message,
        template: "html",
      })
      if (success) {
        totalSent += within1Day.length
      }
    }

    return NextResponse.json({
      success: true,
      message: totalSent > 0 ? `检查完成，发送了 ${totalSent} 条提醒` : "检查完成，暂无需要提醒的优惠券",
      data: {
        totalSent,
        within7Days: within7Days.length,
        within3Days: within3Days.length,
        within1Day: within1Day.length,
      },
    })
  } catch (error) {
    console.error("检查即将到期优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "检查失败" },
      { status: 500 }
    )
  }
}
