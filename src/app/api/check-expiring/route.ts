import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import {
  getAllCoupons,
  saveCoupons,
  Coupon,
} from "@/lib/webdav-storage"
import { sendPushPlus, generateGroupedExpiringMessage } from "@/lib/pushplus"
import { getRemainingHours, isRemindWithinDays } from "@/lib/utils"
import { toLocalISOString } from "@/lib/datetime-utils"

/**
 * 计算优惠券剩余天数
 * 计算方式：endDate（日期） + endHour:endMinute（时间）
 */
function getDaysRemaining(coupon: any): number {
  const now = new Date()

  // 验证截止日期是否存在
  if (!coupon.endDate) {
    console.error(`优惠券 "${coupon.title}" 没有截止日期`)
    return 0
  }

  // 获取截止时间的小时和分钟
  const endHour = coupon.endHour ?? 23
  const endMinute = coupon.endMinute ?? 59
  const endSecond = 59

  // 提取日期部分（处理可能带时间的格式）
  let datePart: string
  if (coupon.endDate.includes('T')) {
    datePart = coupon.endDate.split('T')[0]
  } else {
    datePart = coupon.endDate
  }

  const [year, month, day] = datePart.split('-').map(Number)
  
  // 创建本地时间对象（北京时间），组合日期和时间
  const endDate = new Date(year, month - 1, day, endHour, endMinute, endSecond)

  // 验证日期解析是否成功
  if (isNaN(endDate.getTime())) {
    console.error(`无效的截止日期: ${coupon.endDate}`)
    return 0
  }

  // 计算剩余毫秒数
  const diffMs = endDate.getTime() - now.getTime()

  // 验证计算结果是否有效
  if (isNaN(diffMs) || !isFinite(diffMs)) {
    console.error(`无效的时间差: diffMs=${diffMs}`)
    return 0
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return diffDays
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
    // 使用精确的小时数判断，确保只有严格小于指定天数的优惠券才会被提醒
    const within7Days: Coupon[] = []
    const within3Days: Coupon[] = []
    const within1Day: Coupon[] = []

    console.log(`总共找到 ${allCoupons.length} 张优惠券`)

    for (const coupon of allCoupons) {
      // 排除已使用的优惠券
      if (coupon.isUsed) {
        continue
      }

      // 计算剩余天数和小时数（仅用于日志输出）
      const hours = getRemainingHours(coupon)
      const days = Math.floor(hours / 24)

      console.log(`优惠券 "${coupon.title}": 剩余 ${days}天 ${hours % 24}小时`)

      // 分组：每次推送都包含所有符合条件的优惠券
      // 每张优惠券只出现在最紧急的那个组中（避免在推送消息中重复显示）
      // 使用 isRemindWithinDays 进行精确判断：剩余小时数 < 天数 * 24
      if (hours < 0) {
        // 已过期，跳过
        continue
      } else if (isRemindWithinDays(coupon, 1)) {
        // 严格小于1天（24小时），最紧急
        within1Day.push(coupon)
      } else if (isRemindWithinDays(coupon, 3)) {
        // 严格小于3天（72小时）
        within3Days.push(coupon)
      } else if (isRemindWithinDays(coupon, 7)) {
        // 严格小于7天（168小时）
        within7Days.push(coupon)
      }
      // 超过7天的不提醒
    }

    console.log(`分组结果: 1天内=${within1Day.length}张, 3天内=${within3Days.length}张, 7天内=${within7Days.length}张`)

    // 5. 合并发送一条推送（按紧急程度排序：1天→3天→7天）
    // 每次推送都包含所有符合条件的优惠券（不管是否已提醒过）
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
        
        // 更新提醒记录（仅用于统计）
        const updatedCoupons = allCoupons.map(coupon => {
          // 检查这张优惠券在哪个组中
          const inWithin1Day = within1Day.some(pc => pc.id === coupon.id)
          const inWithin3Days = within3Days.some(pc => pc.id === coupon.id)
          const inWithin7Days = within7Days.some(pc => pc.id === coupon.id)
          
          if (!inWithin1Day && !inWithin3Days && !inWithin7Days) {
            return coupon
          }
          
          // 获取当前的提醒天数数组
          const currentRemindedDays = (coupon as any).remindedDays || []
          const newRemindedDays = [...currentRemindedDays]
          
          // 只在优惠券实际所在的组中添加提醒天数（避免重复添加）
          if (inWithin1Day && !newRemindedDays.includes(1)) {
            newRemindedDays.push(1)
          } else if (inWithin3Days && !newRemindedDays.includes(3)) {
            newRemindedDays.push(3)
          } else if (inWithin7Days && !newRemindedDays.includes(7)) {
            newRemindedDays.push(7)
          }
          
          // 注意：不再更新 isReminded 字段
          // 每次推送都应该检查即将到期的优惠券，重复提醒
          return {
            ...coupon,
            remindedDays: newRemindedDays,
            // 移除 isReminded 的更新
            updatedAt: toLocalISOString(new Date()),
          }
        })
        
        // 保存更新后的优惠券
        await saveCoupons(updatedCoupons)
        console.log(`已更新提醒记录（remindedDays，不影响下次推送）`)
        
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
