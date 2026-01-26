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

    // 根据过滤条件筛选
    if (filter === 'used') {
      coupons = coupons.filter((c: any) => c.isUsed)
    } else if (filter === 'unused') {
      coupons = coupons.filter((c: any) => !c.isUsed && !isExpired(c))
    } else if (filter === 'expired') {
      coupons = coupons.filter((c: any) => isExpired(c))
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
 * 辅助函数：判断优惠券是否过期
 */
function isExpired(coupon: any): boolean {
  const endDate = new Date(coupon.endDate)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return endDate < now
}
