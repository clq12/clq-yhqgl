import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import { getAllCoupons, getExpiringCoupons, updateCoupon, saveCoupons } from "@/lib/webdav-storage"
import { sendPushPlus, generateExpiringMessage } from "@/lib/pushplus"

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

// 手动测试提醒功能
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const daysParam = searchParams.get('days')
    const days = daysParam ? parseInt(daysParam) : 1

    // 1. 获取配置（优先从环境变量，其次从 Cookie）
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

    if (!config.pushplusToken) {
      return NextResponse.json(
        { success: false, error: "请先配置 PushPlus Token" },
        { status: 400 }
      )
    }

    // 2. 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 3. 获取所有优惠券
    const allCoupons = await getAllCoupons()

    // 4. 获取指定天数到期的优惠券
    const expiringCoupons = await getExpiringCoupons(days)

    if (expiringCoupons.length === 0) {
      return NextResponse.json({
        success: true,
        message: `没有${days}天后到期的优惠券`,
        data: { days, count: 0 }
      })
    }

    // 5. 发送推送（测试模式，不更新提醒状态）
    const message = generateExpiringMessage(expiringCoupons, days)
    const success = await sendPushPlus({
      token: config.pushplusToken,
      title: `[测试] 优惠券即将到期提醒（${days}天）`,
      content: message,
      template: "html",
    })

    if (success) {
      return NextResponse.json({
        success: true,
        message: `测试推送成功，共发送 ${expiringCoupons.length} 张优惠券信息`,
        data: {
          days,
          count: expiringCoupons.length,
          coupons: expiringCoupons.map(c => ({
            id: c.id,
            title: c.title,
            endDate: c.endDate,
            daysRemaining: Math.ceil((new Date(c.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          }))
        }
      })
    } else {
      return NextResponse.json(
        { success: false, error: "推送失败" },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("测试提醒失败:", error)
    return NextResponse.json(
      { success: false, error: "测试失败" },
      { status: 500 }
    )
  }
}
