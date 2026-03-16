import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import { getAllCoupons } from "@/lib/webdav-storage"
import { toLocalISOString, formatLocalDate } from "@/lib/datetime-utils"

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
      // 已使用（不管是否过期）
      coupons = coupons.filter((c: any) => c.isUsed)
    } else if (filter === 'unused') {
      // 未使用且未过期
      coupons = coupons.filter((c: any) => !c.isUsed && !isExpired(c))
    } else if (filter === 'expired') {
      // 已过期且未使用（已使用的已过期不统计在"已过期"中）
      coupons = coupons.filter((c: any) => isExpired(c) && !c.isUsed)
    }

    // 生成导出数据
    const exportData = {
      exportTime: toLocalISOString(new Date()),
      exportCount: coupons.length,
      coupons: coupons
    }

    // 返回JSON数据
    return NextResponse.json({
      success: true,
      data: exportData,
      filename: `coupons_${formatLocalDate(new Date())}.json`
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
 * 辅助函数：计算优惠券剩余天数
 * 计算方式：endDate（日期） + endHour:endMinute（时间）
 */
function getDaysRemaining(coupon: any): number {
  // 验证截止日期是否存在
  if (!coupon.endDate) {
    return 0
  }

  // 获取截止时间的小时和分钟
  const endHour = coupon.endHour ?? 23
  const endMinute = coupon.endMinute ?? 59

  // 提取日期部分（处理可能带时间的格式）
  let datePart: string
  if (coupon.endDate.includes('T')) {
    datePart = coupon.endDate.split('T')[0]
  } else {
    datePart = coupon.endDate
  }

  const [year, month, day] = datePart.split('-').map(Number)
  
  // 创建北京时间（UTC+8）的截止时间戳
  const endDateTimestamp = Date.UTC(year, month - 1, day, endHour, endMinute, 59, 0) - 8 * 60 * 60 * 1000
  
  // 验证时间戳是否有效
  if (isNaN(endDateTimestamp)) {
    return 0
  }
  
  const diffMs = endDateTimestamp - Date.now()
  
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
