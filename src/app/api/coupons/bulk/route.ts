import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import { getAllCoupons, saveCoupons } from "@/lib/webdav-storage"

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

export async function PATCH(request: NextRequest) {
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
    const { ids, action } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "请选择要操作的优惠券" },
        { status: 400 }
      )
    }

    // 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 获取所有优惠券
    const allCoupons = await getAllCoupons()

    // 找到要操作的优惠券
    const targetCoupons = allCoupons.filter(c => ids.includes(c.id))

    if (targetCoupons.length === 0) {
      return NextResponse.json(
        { success: false, error: "未找到指定的优惠券" },
        { status: 404 }
      )
    }

    // 根据操作类型处理
    switch (action) {
      case "markUsed":
        // 批量标记已使用/未使用
        targetCoupons.forEach(coupon => {
          (coupon as any).isUsed = body.isUsed ?? true
        })
        break

      case "delete":
        // 批量删除
        const remainingCoupons = allCoupons.filter(c => !ids.includes(c.id))
        await saveCoupons(remainingCoupons)
        return NextResponse.json({
          success: true,
          message: `成功删除 ${ids.length} 个优惠券`,
          data: { deletedCount: ids.length }
        })

      case "extend":
        // 批量延长截止时间
        const days = body.days ?? 7
        targetCoupons.forEach(coupon => {
          const endDate = new Date(coupon.endDate)
          endDate.setDate(endDate.getDate() + days)
          coupon.endDate = endDate.toISOString().split('T')[0]
        })
        break

      default:
        return NextResponse.json(
          { success: false, error: "不支持的操作类型" },
          { status: 400 }
        )
    }

    // 保存更新后的优惠券
    await saveCoupons(allCoupons)

    return NextResponse.json({
      success: true,
      message: `成功更新 ${targetCoupons.length} 个优惠券`,
      data: { updatedCount: targetCoupons.length }
    })
  } catch (error) {
    console.error("批量操作失败:", error)
    return NextResponse.json(
      { success: false, error: "批量操作失败" },
      { status: 500 }
    )
  }
}
