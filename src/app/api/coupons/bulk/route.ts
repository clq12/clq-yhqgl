import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import { getAllCoupons, saveCoupons } from "@/lib/webdav-storage"
import { safeCreateDate, setLocalTime, toLocalISOString, formatLocalDate } from "@/lib/datetime-utils"

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
 * 批量创建优惠券
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
    const { coupons } = body

    if (!coupons || !Array.isArray(coupons) || coupons.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供要创建的优惠券数据" },
        { status: 400 }
      )
    }

    // 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 获取所有现有优惠券
    const allCoupons = await getAllCoupons()

    console.log('批量添加优惠券:', { inputCount: coupons.length, existingCount: allCoupons.length })

    // 为新优惠券生成ID并添加到列表
    const newCoupons: any[] = coupons.map((coupon: any) => {
      // 获取或使用默认的结束时间（北京时间）
      const endHour = coupon.endHour ?? 23
      const endMinute = coupon.endMinute ?? 59

      // 使用safeCreateDate创建本地时间的Date对象
      const startDate = safeCreateDate(coupon.startDate) || safeCreateDate(formatLocalDate(new Date()))!
      const endDate = safeCreateDate(coupon.endDate) || safeCreateDate(formatLocalDate(new Date()))!

      // 使用setLocalTime设置结束时间（北京时间）
      const finalEndDate = setLocalTime(endDate, endHour, endMinute, 59, 999)

      // 清理数据，只保留需要的字段
      const cleanedCoupon = {
        id: crypto.randomUUID(),
        title: coupon.title || '',
        description: coupon.description || null,
        discountType: coupon.discountType || 'amount',
        discountAmount: coupon.discountAmount || null,
        fullAmount: coupon.fullAmount, // 满减金额，用于满减类型
        startDate: formatLocalDate(startDate),
        endDate: toLocalISOString(finalEndDate), // 保存完整的时间（包含时分秒）
        endHour: endHour,
        endMinute: endMinute,
        notes: coupon.notes || null,
        storeName: coupon.storeName || null,
        createdAt: toLocalISOString(new Date()),
        updatedAt: toLocalISOString(new Date()),
        isReminded: false,
        remindedDays: [],
        isUsed: coupon.isUsed ?? false,
      }
      return cleanedCoupon
    })

    // 保存更新后的优惠券
    await saveCoupons([...allCoupons, ...newCoupons])

    return NextResponse.json({
      success: true,
      message: `成功添加 ${newCoupons.length} 个优惠券`,
      data: { addedCount: newCoupons.length, coupons: newCoupons }
    })
  } catch (error) {
    console.error("批量创建优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "批量创建优惠券失败" },
      { status: 500 }
    )
  }
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
          coupon.endDate = formatLocalDate(endDate)
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
