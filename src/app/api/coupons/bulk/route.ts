import { NextRequest, NextResponse } from "next/server"
import { couponManager } from "@/storage/database"
import { setLocalTime } from "@/lib/datetime-utils"

/**
 * 批量创建优惠券
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { coupons: couponList } = body

    if (!couponList || !Array.isArray(couponList) || couponList.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供要创建的优惠券数据" },
        { status: 400 }
      )
    }

    console.log('批量添加优惠券:', { inputCount: couponList.length })

    // 为新优惠券生成ID并添加
    const newCoupons = []
    for (const coupon of couponList) {
      const endHour = coupon.endHour ?? 23
      const endMinute = coupon.endMinute ?? 59

      let startDate = coupon.startDate ? new Date(coupon.startDate) : new Date()
      let endDate = coupon.endDate ? new Date(coupon.endDate) : new Date()

      if (endDate instanceof Date) {
        endDate = setLocalTime(endDate, endHour, endMinute, 59, 999)
      }

      const couponData = {
        title: coupon.title || '',
        description: coupon.description || null,
        discountType: coupon.discountType || 'amount',
        discountAmount: coupon.discountAmount || null,
        fullAmount: coupon.fullAmount || null,
        storeName: coupon.storeName || coupon.brand || null,
        startDate,
        endDate,
        endHour,
        endMinute,
        notes: coupon.notes || null,
        isUsed: coupon.isUsed ?? false,
        isReminded: false,
        remindedDays: [],
      }

      const created = await couponManager.addCoupon(couponData)
      newCoupons.push(created)
    }

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
    const body = await request.json()
    const { ids, action } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "请选择要操作的优惠券" },
        { status: 400 }
      )
    }

    // 根据操作类型处理
    switch (action) {
      case "markUsed": {
        const count = await couponManager.bulkUpdateStatus(ids, { isUsed: body.isUsed ?? true })
        return NextResponse.json({
          success: true,
          message: `成功更新 ${count} 个优惠券状态`,
          data: { updatedCount: count }
        })
      }

      case "delete": {
        const count = await couponManager.deleteCoupons(ids)
        return NextResponse.json({
          success: true,
          message: `成功删除 ${count} 个优惠券`,
          data: { deletedCount: count }
        })
      }

      case "extend": {
        const days = body.days ?? 7
        let count = 0
        for (const id of ids) {
          const coupon = await couponManager.getCouponById(id)
          if (coupon && coupon.endDate) {
            const endDate = new Date(coupon.endDate)
            endDate.setDate(endDate.getDate() + days)
            await couponManager.updateCoupon(id, { endDate })
            count++
          }
        }
        return NextResponse.json({
          success: true,
          message: `成功延长 ${count} 个优惠券截止时间`,
          data: { extendedCount: count }
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: "不支持的操作类型" },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error("批量操作失败:", error)
    return NextResponse.json(
      { success: false, error: "批量操作失败" },
      { status: 500 }
    )
  }
}
