import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import { getAllCoupons } from "@/lib/webdav-storage"

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

/**
 * 导出优惠券
 */
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
    const { filter } = body

    // 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 获取所有优惠券
    let coupons = await getAllCoupons()

    // 根据过滤条件筛选（与前端统计逻辑保持一致）
    if (filter === 'used') {
      // 已使用且未过期
      coupons = coupons.filter((c: any) => c.isUsed && !isExpired(c))
    } else if (filter === 'unused') {
      // 未使用且未过期
      coupons = coupons.filter((c: any) => !c.isUsed && !isExpired(c))
    } else if (filter === 'expired') {
      // 已过期且未使用
      coupons = coupons.filter((c: any) => isExpired(c) && !c.isUsed)
    }

    // 生成导出数据
    const exportData = {
      exportTime: new Date().toISOString(),
      exportCount: coupons.length,
      coupons: coupons
    }

    // 返回JSON数据
    return NextResponse.json({
      success: true,
      data: exportData,
      filename: `coupons_${new Date().toISOString().split('T')[0]}.json`
    })
  } catch (error) {
    console.error("导出优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "导出优惠券失败" },
      { status: 500 }
    )
  }
}

/**
 * 辅助函数：计算优惠券剩余天数（使用北京时间 UTC+8，与前端逻辑保持一致）
 */
function getDaysRemaining(coupon: any): number {
  const now = new Date()
  
  // 验证截止日期是否存在
  if (!coupon.endDate) {
    return 0
  }
  
  // 解析截止日期
  let endDate: Date
  
  // 检查日期是否已经包含时间部分（完整的ISO格式）
  if (coupon.endDate.includes('T') || coupon.endDate.includes(' ')) {
    endDate = new Date(coupon.endDate)
  } else {
    // 纯日期格式，添加时间部分
    endDate = new Date(coupon.endDate + 'T00:00:00Z')
  }
  
  // 验证日期解析是否成功
  if (isNaN(endDate.getTime())) {
    return 0
  }
  
  // 获取截止时间的小时和分钟
  const endHour = (coupon as any).endHour ?? 23
  const endMinute = (coupon as any).endMinute ?? 59
  
  // 设置截止时间（UTC时间，然后转换为UTC+8时间戳）
  // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
  let utcHour = endHour - 8
  if (utcHour < 0) {
    utcHour += 24
    endDate.setDate(endDate.getDate() - 1)
  }
  endDate.setUTCHours(utcHour, endMinute, 0, 0)
  
  // 当前时间（UTC）
  const nowUTC = now.getTime()
  
  // 截止时间（UTC）
  const endTimeUTC = endDate.getTime()
  
  const diffMs = endTimeUTC - nowUTC
  
  // 验证计算结果是否有效
  if (isNaN(diffMs) || !isFinite(diffMs)) {
    return 0
  }
  
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

/**
 * 辅助函数：判断优惠券是否过期（使用北京时间 UTC+8）
 */
function isExpired(coupon: any): boolean {
  const days = getDaysRemaining(coupon)
  return days < 0
}
