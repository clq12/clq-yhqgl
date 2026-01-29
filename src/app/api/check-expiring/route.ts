import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getAllCoupons,
  saveCoupons,
  Coupon,
} from "@/lib/webdav-storage"
import { sendPushPlus, generateGroupedExpiringMessage } from "@/lib/pushplus"

/**
 * 计算优惠券剩余天数（使用北京时间 UTC+8）
 */
function getDaysRemaining(coupon: any): number {
  const now = new Date()
  
  // 获取截止时间的小时和分钟
  const endHour = (coupon as any).endHour ?? 23
  const endMinute = (coupon as any).endMinute ?? 59
  
  // 解析截止日期（使用UTC时间，避免时区影响）
  const endDate = new Date(coupon.endDate + 'T00:00:00Z')
  
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
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

/**
 * 计算优惠券剩余小时数（使用北京时间 UTC+8）
 */
function getRemainingHours(coupon: any): number {
  const now = new Date()
  
  // 获取截止时间的小时和分钟
  const endHour = (coupon as any).endHour ?? 23
  const endMinute = (coupon as any).endMinute ?? 59
  
  // 解析截止日期（使用UTC时间，避免时区影响）
  const endDate = new Date(coupon.endDate + 'T00:00:00Z')
  
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
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))
  return Math.max(0, diffHours)
}

/**
 * 从环境变量获取配置（用于定时任务）
 */
function getConfigFromEnv(): WebDAVConfig | null {
  const {
    WEBDAV_URL,
    WEBDAV_USERNAME,
    WEBDAV_PASSWORD,
    PUSHPLUS_TOKEN,
  } = process.env

  if (WEBDAV_URL && WEBDAV_USERNAME && WEBDAV_PASSWORD) {
    const config: WebDAVConfig = {
      url: WEBDAV_URL,
      username: WEBDAV_USERNAME,
      password: WEBDAV_PASSWORD,
    }

    if (PUSHPLUS_TOKEN) {
      config.pushplusToken = PUSHPLUS_TOKEN
    }

    return config
  }

  return null
}

// 检查即将到期的优惠券并发送推送
export async function GET(request: NextRequest) {
  try {
    // 1. 获取配置（优先从环境变量，其次从 Cookie）
    let config = getConfigFromEnv()

    if (!config) {
      config = getWebDAVConfigFromRequest(request)
    }

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: "请先配置 WebDAV（通过应用界面或环境变量）",
          hint: "定时任务需要配置环境变量：WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD, PUSHPLUS_TOKEN",
        },
        { status: 401 }
      )
    }

    if (!config.pushplusToken) {
      return NextResponse.json(
        {
          success: false,
          error: "请先配置 PushPlus Token（通过应用界面或环境变量 PUSHPLUS_TOKEN）",
        },
        { status: 400 }
      )
    }

    // 2. 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 3. 获取所有优惠券
    const allCoupons = await getAllCoupons()

    // 4. 新的提醒逻辑：合并推送，按紧急程度排序
    // 检查所有未使用的优惠券，根据剩余时间分组
    const within7Days: Coupon[] = []
    const within3Days: Coupon[] = []
    const within1Day: Coupon[] = []

    console.log(`总共找到 ${allCoupons.length} 张优惠券`)

    for (const coupon of allCoupons) {
      // 排除已使用的优惠券
      if (coupon.isUsed) {
        continue
      }

      // 计算剩余天数
      const days = getDaysRemaining(coupon)
      const hours = getRemainingHours(coupon)

      console.log(`优惠券 "${coupon.title}": 剩余 ${days}天 ${hours}小时`)

      // 获取已提醒的天数数组
      const remindedDays = (coupon as any).remindedDays || []

      // 分组（使用 remindedDays 数组检查是否已提醒，支持多次提醒）
      // 每张优惠券只在最紧急的未提醒天数中推送一次
      if (days <= 1 && !remindedDays.includes(1)) {
        // 1天内到期且未在1天时提醒过
        within1Day.push(coupon)
        console.log(`  -> 加入1天内组（未在1天时提醒过）`)
      } else if (days <= 3 && !remindedDays.includes(3)) {
        // 3天内到期且未在3天时提醒过
        within3Days.push(coupon)
        console.log(`  -> 加入3天内组（未在3天时提醒过）`)
      } else if (days <= 7 && !remindedDays.includes(7)) {
        // 7天内到期且未在7天时提醒过
        within7Days.push(coupon)
        console.log(`  -> 加入7天内组（未在7天时提醒过）`)
      } else if (days <= 7) {
        // 在7天内但已经在对应的天数提醒过
        console.log(`  -> 跳过（已在 ${remindedDays.join(', ')} 天时提醒过）`)
      }
      // 超过7天的不提醒
    }

    console.log(`分组结果: 1天内=${within1Day.length}张, 3天内=${within3Days.length}张, 7天内=${within7Days.length}张`)

    // 5. 合并发送一条推送（按紧急程度排序：1天→3天→7天）
    // 注意：使用 remindedDays 数组记录在哪些天数已提醒，支持多次提醒（7天、3天、1天）
    const totalCount = within1Day.length + within3Days.length + within7Days.length

    if (totalCount > 0) {
      console.log(`准备发送推送，共 ${totalCount} 张优惠券`)
      console.log(`推送分组: 1天内(${within1Day.length}) + 3天内(${within3Days.length}) + 7天内(${within7Days.length})`)

      const message = generateGroupedExpiringMessage({
        within1Day,
        within3Days,
        within7Days,
      })

      console.log(`推送消息已生成，长度: ${message.length} 字符`)

      const result = await sendPushPlus({
        token: config.pushplusToken,
        title: "优惠券即将到期提醒",
        content: message,
        template: "html",
      })

      if (result.success) {
        console.log(`推送成功！`)
        
        // 更新已推送优惠券的提醒天数
        const updatedCoupons = allCoupons.map(coupon => {
          const days = getDaysRemaining(coupon)
          
          // 检查这张优惠券是否在推送列表中
          const inWithin1Day = within1Day.some(pc => pc.id === coupon.id)
          const inWithin3Days = within3Days.some(pc => pc.id === coupon.id)
          const inWithin7Days = within7Days.some(pc => pc.id === coupon.id)
          
          if (!inWithin1Day && !inWithin3Days && !inWithin7Days) {
            return coupon
          }
          
          // 获取当前的提醒天数数组
          const currentRemindedDays = (coupon as any).remindedDays || []
          const newRemindedDays = [...currentRemindedDays]
          
          // 根据剩余天数添加提醒天数
          if (inWithin1Day && !newRemindedDays.includes(1)) {
            newRemindedDays.push(1)
            console.log(`优惠券 "${coupon.title}" 添加1天提醒`)
          }
          if (inWithin3Days && !newRemindedDays.includes(3)) {
            newRemindedDays.push(3)
            console.log(`优惠券 "${coupon.title}" 添加3天提醒`)
          }
          if (inWithin7Days && !newRemindedDays.includes(7)) {
            newRemindedDays.push(7)
            console.log(`优惠券 "${coupon.title}" 添加7天提醒`)
          }
          
          // 更新提醒状态
          return {
            ...coupon,
            remindedDays: newRemindedDays,
            isReminded: true, // 标记为已提醒
            updatedAt: new Date().toISOString(),
          }
        })
        
        // 保存更新后的优惠券
        await saveCoupons(updatedCoupons)
        console.log(`已更新 ${updatedCoupons.filter(c => c.isReminded).length} 张优惠券的提醒状态`)
        
        return NextResponse.json({
          success: true,
          message: `检查完成，发送了 ${totalCount} 条提醒`,
          data: {
            totalSent: totalCount,
            within7Days: within7Days.length,
            within3Days: within3Days.length,
            within1Day: within1Day.length,
          },
        })
      } else {
        console.error("推送失败:", result.error)
        return NextResponse.json(
          {
            success: false,
            error: "推送发送失败",
            details: result.error
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: "检查完成，暂无需要提醒的优惠券",
      data: {
        totalSent: 0,
        within7Days: within7Days.length,
        within3Days: within3Days.length,
        within1Day: within1Day.length,
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
