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
 * 调价日检测
 * 中国油价每10个工作日调整一次
 * 返回：isAdjustmentDay（是否是调价日），isNextDay（是否是调价日次日）
 */
function checkAdjustmentDay(): { isAdjustmentDay: boolean; isNextDay: boolean } {
  const now = new Date()
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000) // 转换为北京时间
  
  // 2025年已知的油价调整日（每10个工作日调整一次）
  // 注意：这些日期需要根据实际调整日历更新
  const adjustmentDays = [
    "2025-01-03", "2025-01-17", "2025-02-06", "2025-02-20",
    "2025-03-06", "2025-03-20", "2025-04-03", "2025-04-17",
    "2025-05-08", "2025-05-22", "2025-06-05", "2025-06-19",
    "2025-07-03", "2025-07-17", "2025-08-01", "2025-08-15",
    "2025-09-05", "2025-09-19", "2025-10-10", "2025-10-24",
    "2025-11-07", "2025-11-21", "2025-12-05", "2025-12-19",
  ]
  
  // 格式化当前日期为 YYYY-MM-DD（北京时间）
  const currentDateStr = beijingTime.toISOString().split('T')[0]
  
  // 计算明天的日期（北京时间）
  const tomorrow = new Date(beijingTime)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowDateStr = tomorrow.toISOString().split('T')[0]
  
  // 检查是否是调价日或调价日次日
  const isAdjustmentDay = adjustmentDays.includes(currentDateStr)
  const isNextDay = adjustmentDays.includes(tomorrowDateStr)
  
  return { isAdjustmentDay, isNextDay }
}

/**
 * 计算优惠券剩余天数（使用北京时间 UTC+8）
 */
function getDaysRemaining(coupon: any): number {
  const now = new Date()

  // 验证截止日期是否存在
  if (!coupon.endDate) {
    console.error(`优惠券 "${coupon.title}" 没有截止日期`)
    return 0
  }

  // 解析截止日期
  let endDate: Date

  // 检查日期是否已经包含时间部分（完整的ISO格式）
  if (coupon.endDate.includes('T') || coupon.endDate.includes(' ')) {
    // 完整ISO格式，需要检查是否有时区信息
    if (coupon.endDate.endsWith('Z')) {
      // 有时区信息（UTC），直接使用
      endDate = new Date(coupon.endDate)
    } else {
      // 没有时区信息，假设是北京时间，转换为UTC
      const beijingDate = new Date(coupon.endDate)
      // 北京时间 = UTC + 8，所以 UTC = 北京时间 - 8小时
      endDate = new Date(beijingDate.getTime() - 8 * 60 * 60 * 1000)
    }
  } else {
    // 纯日期格式，添加时间部分
    endDate = new Date(coupon.endDate + 'T00:00:00Z')

    // 获取截止时间的小时和分钟（只对纯日期格式添加）
    const endHour = (coupon as any).endHour ?? 23
    const endMinute = (coupon as any).endMinute ?? 59

    // 设置截止时间（UTC时间）
    // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
    let utcHour = endHour - 8
    if (utcHour < 0) {
      utcHour += 24
      endDate.setDate(endDate.getDate() - 1)
    }
    endDate.setUTCHours(utcHour, endMinute, 0, 0)
  }

  // 验证日期解析是否成功
  if (isNaN(endDate.getTime())) {
    console.error(`无效的截止日期: ${coupon.endDate}`)
    return 0
  }

  // 当前时间（UTC）
  const nowUTC = now.getTime()

  // 截止时间（UTC）
  const endTimeUTC = endDate.getTime()

  const diffMs = endTimeUTC - nowUTC

  // 验证计算结果是否有效
  if (isNaN(diffMs) || !isFinite(diffMs)) {
    console.error(`无效的时间差: diffMs=${diffMs}`)
    return 0
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * 计算优惠券剩余小时数（使用北京时间 UTC+8）
 */
function getRemainingHours(coupon: any): number {
  const now = new Date()

  // 验证截止日期是否存在
  if (!coupon.endDate) {
    return 0
  }

  // 解析截止日期
  let endDate: Date

  // 检查日期是否已经包含时间部分（完整的ISO格式）
  if (coupon.endDate.includes('T') || coupon.endDate.includes(' ')) {
    // 完整ISO格式，需要检查是否有时区信息
    if (coupon.endDate.endsWith('Z')) {
      // 有时区信息（UTC），直接使用
      endDate = new Date(coupon.endDate)
    } else {
      // 没有时区信息，假设是北京时间，转换为UTC
      const beijingDate = new Date(coupon.endDate)
      // 北京时间 = UTC + 8，所以 UTC = 北京时间 - 8小时
      endDate = new Date(beijingDate.getTime() - 8 * 60 * 60 * 1000)
    }
  } else {
    // 纯日期格式，添加时间部分
    endDate = new Date(coupon.endDate + 'T00:00:00Z')

    // 获取截止时间的小时和分钟（只对纯日期格式添加）
    const endHour = (coupon as any).endHour ?? 23
    const endMinute = (coupon as any).endMinute ?? 59

    // 设置截止时间（UTC时间）
    // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
    let utcHour = endHour - 8
    if (utcHour < 0) {
      utcHour += 24
      endDate.setDate(endDate.getDate() - 1)
    }
    endDate.setUTCHours(utcHour, endMinute, 0, 0)
  }

  // 验证日期解析是否成功
  if (isNaN(endDate.getTime())) {
    return 0
  }

  // 当前时间（UTC）
  const nowUTC = now.getTime()

  // 截止时间（UTC）
  const endTimeUTC = endDate.getTime()

  const diffMs = endTimeUTC - nowUTC

  // 验证计算结果是否有效
  if (isNaN(diffMs) || !isFinite(diffMs)) {
    return 0
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  return diffHours
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
    // 0. 检查是否是调价日或调价日次日
    const { isAdjustmentDay, isNextDay } = checkAdjustmentDay()
    const now = new Date()
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000) // 转换为北京时间
    const currentHour = beijingTime.getUTCHours() // UTC小时（北京时间8:30 = UTC 0:30）
    const currentMinute = beijingTime.getUTCMinutes()
    
    console.log(`调价日检测: isAdjustmentDay=${isAdjustmentDay}, isNextDay=${isNextDay}, 当前北京时间=${beijingTime.toISOString()}`)

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

    // 4. 调价日处理：如果是调价日且时间是8:30，发送油价趋势推送
    if (isAdjustmentDay && currentHour === 0 && currentMinute === 30) {
      console.log("检测到调价日8:30，开始获取油价趋势...")

      try {
        // 调用油价检测API
        const oilPriceResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/check-oil-price`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (oilPriceResponse.ok) {
          const oilPriceData = await oilPriceResponse.json()

          if (oilPriceData.success && oilPriceData.data) {
            const trend = oilPriceData.data
            console.log(`油价趋势分析结果: ${JSON.stringify(trend)}`)

            // 生成油价趋势推送消息
            const oilPriceMessage = `
<h3>🚗 油价趋势预测</h3>
<p>中国下一轮油价调整预测：</p>
<ul>
  <li><strong>趋势：</strong>${trend.trend}</li>
  <li><strong>置信度：</strong>${trend.confidence}%</li>
  <li><strong>原因：</strong>${trend.core_factor}</li>
</ul>
<p><em>注：油价以国家发改委最终公布为准，请以官方消息为准。</em></p>
`.trim()

            const result = await sendPushPlus({
              token: config.pushplusToken,
              title: "油价调整提醒",
              content: oilPriceMessage,
              template: "html",
            })

            if (result.success) {
              console.log("油价趋势推送成功！")
              return NextResponse.json({
                success: true,
                message: "油价趋势推送成功",
                data: trend,
              })
            } else {
              console.error("油价趋势推送失败:", result.error)
            }
          } else {
            console.error("油价趋势API返回失败:", oilPriceData)
          }
        } else {
          console.error("油价趋势API调用失败:", oilPriceResponse.status)
        }
      } catch (error) {
        console.error("获取油价趋势失败:", error)
      }

      // 如果油价推送失败，继续执行常规推送逻辑
    }

    // 5. 获取油价变化信息（仅在调价日次日）
    let oilPriceSection = ""
    if (isNextDay) {
      console.log("检测到调价日次日，获取油价变化信息...")

      try {
        // 调用油价检测API
        const oilPriceResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/check-oil-price`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (oilPriceResponse.ok) {
          const oilPriceData = await oilPriceResponse.json()

          if (oilPriceData.success && oilPriceData.data) {
            const trend = oilPriceData.data
            console.log(`油价变化信息: ${JSON.stringify(trend)}`)

            oilPriceSection = `
<h3>🚗 油价变化提醒</h3>
<p>中国下一轮油价预测：</p>
<ul>
  <li><strong>趋势：</strong>${trend.trend}</li>
  <li><strong>置信度：</strong>${trend.confidence}%</li>
  <li><strong>原因：</strong>${trend.core_factor}</li>
</ul>
<hr/>
`.trim()
          }
        }
      } catch (error) {
        console.error("获取油价变化失败:", error)
      }
    }

    // 6. 新的提醒逻辑：合并推送，按紧急程度排序
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

      // 分组：每次推送都包含所有符合条件的优惠券
      // 每张优惠券只出现在最紧急的那个组中（避免在推送消息中重复显示）
      if (days < 0) {
        // 已过期，跳过
        continue
      } else if (days <= 1) {
        // 1天内到期（最紧急）
        within1Day.push(coupon)
      } else if (days <= 3) {
        // 3天内到期
        within3Days.push(coupon)
      } else if (days <= 7) {
        // 7天内到期
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
      }, oilPriceSection)

      console.log(`推送消息已生成，长度: ${message.length} 字符`)

      const result = await sendPushPlus({
        token: config.pushplusToken,
        title: "优惠券即将到期提醒",
        content: message,
        template: "html",
      })

      if (result.success) {
        console.log(`推送成功！`)
        
        // 更新提醒记录（用于统计）
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
          
          // 更新提醒状态（仅用于显示和统计，不影响推送逻辑）
          return {
            ...coupon,
            remindedDays: newRemindedDays,
            isReminded: true,
            updatedAt: new Date().toISOString(),
          }
        })
        
        // 保存更新后的优惠券
        await saveCoupons(updatedCoupons)
        console.log(`已更新提醒记录（用于统计，不影响下次推送）`)
        
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
