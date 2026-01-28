import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import { getAllCoupons, getExpiringCoupons } from "@/lib/webdav-storage"

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

// 查询所有优惠券的提醒状态
export async function GET(request: NextRequest) {
  try {
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

    // 2. 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 3. 获取所有优惠券
    const allCoupons = await getAllCoupons()

    // 4. 获取即将到期的优惠券
    const expiring7Days = await getExpiringCoupons(7)
    const expiring3Days = await getExpiringCoupons(3)
    const expiring1Day = await getExpiringCoupons(1)

    // 5. 分析提醒状态（使用北京时间 UTC+8）
    const now = new Date()
    
    const statusList = allCoupons.map(coupon => {
      const endHour = (coupon as any).endHour
      const endMinute = (coupon as any).endMinute ?? 59
      
      // 解析截止日期（使用UTC时间，避免时区影响）
      const endDate = new Date(coupon.endDate + 'T00:00:00Z')
      
      // 设置截止时间（UTC时间）
      // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
      let utcHour = (endHour ?? 23) - 8
      if (utcHour < 0) {
        utcHour += 24
        endDate.setDate(endDate.getDate() - 1)
      }
      endDate.setUTCHours(utcHour, endMinute, 0, 0)
      
      // 当前时间（UTC）
      const nowUTC = now.getTime()
      
      // 截止时间（UTC）
      const endTimeUTC = endDate.getTime()
      
      const diff = endTimeUTC - nowUTC
      const totalHours = diff / (1000 * 60 * 60)
      const daysRemaining = Math.ceil(totalHours / 24)
      const remindedDays = (coupon as any).remindedDays || []

      // 计算精确到小时的剩余时间文本
      let remainingTimeText = ""
      if (totalHours < 0) {
        remainingTimeText = "已过期"
      } else {
        const days = Math.floor(totalHours / 24)
        const hours = Math.floor(totalHours % 24)
        if (days === 0) {
          remainingTimeText = `${hours}小时后到期`
        } else if (hours === 0) {
          remainingTimeText = `${days}天后到期`
        } else {
          remainingTimeText = `${days}天${hours}小时后到期`
        }
      }

      // 判断是否会提醒
      const willRemind = () => {
        if (daysRemaining <= 0) return { will: false, reason: "已过期" }
        if (daysRemaining > 7) return { will: false, reason: "距离到期还远" }

        // 检查是否已经提醒过
        const willRemindDays = []
        if (daysRemaining === 7 && !remindedDays.includes(7)) willRemindDays.push(7)
        if (daysRemaining === 3 && !remindedDays.includes(3)) willRemindDays.push(3)
        if (daysRemaining === 1 && !remindedDays.includes(1)) willRemindDays.push(1)

        if (willRemindDays.length > 0) {
          return { will: true, days: willRemindDays }
        } else {
          return { will: false, reason: "已提醒过" }
        }
      }

      const remindInfo = willRemind()

      return {
        id: coupon.id,
        title: coupon.title,
        endDate: coupon.endDate,
        daysRemaining,
        remainingTimeText,
        isReminded: coupon.isReminded,
        remindedDays,
        willRemind: remindInfo.will,
        remindDays: remindInfo.days || [],
        reason: remindInfo.reason
      }
    })

    // 6. 统计信息
    const stats = {
      total: allCoupons.length,
      expiring7Days: expiring7Days.length,
      expiring3Days: expiring3Days.length,
      expiring1Day: expiring1Day.length,
      willRemind: statusList.filter(s => s.willRemind).length,
      alreadyReminded: statusList.filter(s => s.isReminded).length
    }

    return NextResponse.json({
      success: true,
      data: {
        stats,
        statusList
      }
    })
  } catch (error) {
    console.error("查询提醒状态失败:", error)
    return NextResponse.json(
      { success: false, error: "查询失败" },
      { status: 500 }
    )
  }
}
