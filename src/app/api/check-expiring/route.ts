import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getAllCoupons,
  getExpiringCoupons,
  updateCoupon,
  saveCoupons,
} from "@/lib/webdav-storage"
import { sendPushPlus, generateExpiringMessage } from "@/lib/pushplus"

// 检查即将到期的优惠券并发送推送
export async function GET(request: NextRequest) {
  try {
    // 1. 获取配置
    const config = getWebDAVConfigFromRequest(request)

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

    // 4. 定义需要检查的天数（按顺序从远到近）
    const checkDays = [7, 3, 1]
    let totalSent = 0
    const updatedCoupons = [...allCoupons]
    const results: Record<number, number> = { 7: 0, 3: 0, 1: 0 }

    // 5. 对每个天数进行检查
    for (const days of checkDays) {
      // 获取该天数到期的优惠券
      const expiringCoupons = await getExpiringCoupons(days)

      // 过滤出还没有在该天数提醒过的优惠券
      const needRemind = expiringCoupons.filter(
        (coupon) => !coupon.remindedDays?.includes(days)
      )

      if (needRemind.length === 0) {
        continue
      }

      // 生成并发送推送消息
      const message = generateExpiringMessage(needRemind, days)
      const success = await sendPushPlus({
        token: config.pushplusToken,
        title: `优惠券即将到期提醒（${days}天）`,
        content: message,
        template: "html",
      })

      if (success) {
        totalSent++
        results[days] = needRemind.length

        // 更新优惠券的提醒状态
        for (const coupon of needRemind) {
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
      }
    }

    // 6. 保存更新后的优惠券
    await saveCoupons(updatedCoupons)

    return NextResponse.json({
      success: true,
      message: `检查完成，发送了 ${totalSent} 条提醒`,
      data: {
        results,
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
