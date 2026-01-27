import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getAllCoupons,
  getExpiringCoupons,
  updateCoupon,
  saveCoupons,
  getCouponsToRemindNow,
} from "@/lib/webdav-storage"
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

    // 4. 使用精确到小时的提醒逻辑
    // 按天分组检查当前时刻需要提醒的优惠券（7天、3天、1天前的相同小时）
    let totalSent = 0
    const updatedCoupons = [...allCoupons]

    for (const days of [7, 3, 1]) {
      const { coupons: needRemindCoupons } = await getCouponsToRemindNow([days])

      // 5. 如果有需要提醒的优惠券，发送推送
      if (needRemindCoupons.length > 0) {
        // 生成并发送推送消息
        const message = generateExpiringMessage(needRemindCoupons, days)
        const success = await sendPushPlus({
          token: config.pushplusToken,
          title: `优惠券即将到期提醒（${days}天）`,
          content: message,
          template: "html",
        })

        if (success) {
          totalSent += needRemindCoupons.length

          // 更新优惠券的提醒状态
          for (const coupon of needRemindCoupons) {
            const index = updatedCoupons.findIndex((c) => c.id === coupon.id)
            if (index !== -1) {
              const remindedDays = updatedCoupons[index].remindedDays || []
              updatedCoupons[index] = {
                ...updatedCoupons[index],
                remindedDays: [...remindedDays, days],
                isReminded: true,
                updatedAt: new Date().toISOString(),
              }
            }
          }
        } else {
          console.error(`发送 ${days}天前的提醒失败`)
        }
      }
    }

    // 6. 如果有优惠券被更新，保存到 WebDAV
    if (totalSent > 0) {
      await saveCoupons(updatedCoupons)
    }

    return NextResponse.json({
      success: true,
      message: totalSent > 0 ? `检查完成，发送了 ${totalSent} 条提醒` : "检查完成，暂无需要提醒的优惠券",
      data: {
        totalSent,
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
