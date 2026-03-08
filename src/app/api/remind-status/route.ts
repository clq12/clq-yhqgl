import { NextResponse } from "next/server"
import { couponManager } from "@/storage/database"

// 查询所有优惠券的提醒状态
export async function GET() {
  try {
    // 获取所有优惠券
    const allCoupons = await couponManager.getAllCoupons()

    // 分析提醒状态（使用北京时间 UTC+8）
    const now = new Date()
    
    // 过滤掉已使用的优惠券
    const unusedCoupons = allCoupons.filter(coupon => !coupon.isUsed)
    
    const statusList = unusedCoupons.map(coupon => {
      const endHour = coupon.endHour ?? 23
      const endMinute = coupon.endMinute ?? 59
      
      // 解析截止日期
      const endDate = coupon.endDate ? new Date(coupon.endDate) : null
      
      // 验证日期解析是否成功
      if (!endDate || isNaN(endDate.getTime())) {
        return {
          id: String(coupon.id),
          title: coupon.title,
          endDate: '',
          daysRemaining: 0,
          remainingTimeText: "截止日期无效",
          isReminded: coupon.isReminded,
          remindedDays: coupon.remindedDays || [],
          willRemind: false,
          remindDays: [],
          reason: "截止日期无效"
        }
      }
      
      // 设置截止时间
      endDate.setHours(endHour, endMinute, 0, 0)
      
      const diff = endDate.getTime() - now.getTime()
      const totalHours = diff / (1000 * 60 * 60)
      const daysRemaining = Math.ceil(totalHours / 24)
      const remindedDays = coupon.remindedDays || []

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
        id: String(coupon.id),
        title: coupon.title,
        endDate: coupon.endDate ? String(coupon.endDate) : '',
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
      expiring7Days: statusList.filter(s => s.daysRemaining <= 7 && s.daysRemaining > 0).length,
      expiring3Days: statusList.filter(s => s.daysRemaining <= 3 && s.daysRemaining > 0).length,
      expiring1Day: statusList.filter(s => s.daysRemaining <= 1 && s.daysRemaining > 0).length,
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
