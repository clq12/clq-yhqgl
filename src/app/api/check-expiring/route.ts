import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getAllCoupons,
  getExpiringCoupons,
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

    // 过滤掉已提醒的优惠券
    const unremindedCoupons = allCoupons.filter(c => !c.isReminded)

    // 4. 检查即将到期的优惠券（7天、3天、1天）
    const expiring7Days = await getExpiringCoupons(7).then(coupons =>
      coupons.filter(c => unremindedCoupons.some(uc => uc.id === c.id))
    )
    const expiring3Days = await getExpiringCoupons(3).then(coupons =>
      coupons.filter(c => unremindedCoupons.some(uc => uc.id === c.id))
    )
    const expiring1Day = await getExpiringCoupons(1).then(coupons =>
      coupons.filter(c => unremindedCoupons.some(uc => uc.id === c.id))
    )

    // 5. 发送推送
    let sentCount = 0

    if (expiring7Days.length > 0) {
      const message = generateExpiringMessage(expiring7Days, 7)
      await sendPushPlus({
        token: config.pushplusToken,
        title: "优惠券即将到期提醒（7天）",
        content: message,
        template: "html",
      })
      sentCount++
    }

    if (expiring3Days.length > 0) {
      const message = generateExpiringMessage(expiring3Days, 3)
      await sendPushPlus({
        token: config.pushplusToken,
        title: "优惠券即将到期提醒（3天）",
        content: message,
        template: "html",
      })
      sentCount++
    }

    if (expiring1Day.length > 0) {
      const message = generateExpiringMessage(expiring1Day, 1)
      await sendPushPlus({
        token: config.pushplusToken,
        title: "优惠券即将到期提醒（1天）",
        content: message,
        template: "html",
      })
      sentCount++
    }

    return NextResponse.json({
      success: true,
      message: `检查完成，发送了 ${sentCount} 条提醒`,
      data: {
        expiring7Days: expiring7Days.length,
        expiring3Days: expiring3Days.length,
        expiring1Day: expiring1Day.length,
        totalSent: sentCount,
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
