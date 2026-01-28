/**
 * PushPlus 推送功能
 * 文档：http://www.pushplus.plus/doc/
 */

export interface PushPlusMessage {
  title: string
  content: string
  template?: string // html/json/text
  token: string
}

/**
 * 发送 PushPlus 消息
 */
export async function sendPushPlus(message: PushPlusMessage): Promise<{ success: boolean; error?: string }> {
  try {
    // 使用 HTTPS 协议
    const url = "https://www.pushplus.plus/send"

    const params = new URLSearchParams({
      token: message.token,
      title: message.title,
      content: message.content,
      template: message.template || "html",
    })

    // 使用 POST 方法，参数放在请求体中
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })

    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`PushPlus API HTTP 错误: ${response.status}`)
      console.error(`响应内容: ${errorText.substring(0, 200)}`)
      return {
        success: false,
        error: `HTTP 错误: ${response.status}`
      }
    }

    // 检查响应类型
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      const errorText = await response.text()
      console.error(`PushPlus API 返回非 JSON 响应: ${contentType}`)
      console.error(`响应内容: ${errorText.substring(0, 200)}`)
      return {
        success: false,
        error: `API 返回非 JSON 格式，可能是 Token 无效或 API 地址错误`
      }
    }

    const result = await response.json()

    if (result.code === 200) {
      return { success: true }
    } else {
      return {
        success: false,
        error: result.msg || `PushPlus API 返回错误: code=${result.code}`
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error("PushPlus 推送失败:", errorMsg)
    return {
      success: false,
      error: `推送失败: ${errorMsg}`
    }
  }
}

/**
 * 计算剩余天数和小时数（使用北京时间 UTC+8）
 */
function calculateRemainingTime(coupon: any): { days: number; hours: number; text: string } {
  const now = new Date()
  
  // 获取截止时间的小时和分钟
  const endHour = (coupon as any).endHour ?? 23
  const endMinute = (coupon as any).endMinute ?? 59
  
  // 解析截止日期（使用UTC时间，避免时区影响）
  const endDate = new Date(coupon.endDate + 'T00:00:00Z')
  
  // 设置截止时间（UTC时间）
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

  // 计算天数和小时数
  const totalHours = Math.ceil(diffMs / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  // 生成显示文本
  let text = ""
  if (days > 0) {
    text += `${days}天`
  }
  if (hours > 0 || days === 0) {
    text += `${hours}小时`
  }

  return { days, hours, text }
}

/**
 * 格式化到期时间（北京时间 UTC+8）
 */
function formatExpiryDate(coupon: any): string {
  const endHour = (coupon as any).endHour
  const endMinute = (coupon as any).endMinute ?? 59
  
  if (endHour !== null && endHour !== undefined) {
    return `${coupon.endDate} ${endHour}:${endMinute.toString().padStart(2, '0')}`
  } else {
    return `${coupon.endDate} 23:59`
  }
}

/**
 * 生成优惠券到期提醒消息
 */
export function generateExpiringMessage(coupons: any[], days: number): string {
  if (coupons.length === 0) {
    return ""
  }

  const today = new Date().toLocaleDateString("zh-CN")

  let html = `
    <div style="font-family: 'Microsoft YaHei', sans-serif; padding: 20px; background-color: #f5f5f5;">
      <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #e11d48; margin: 0 0 16px 0; font-size: 24px;">
          🔔 优惠券即将到期提醒
        </h2>
        <p style="color: #666; margin: 0 0 20px 0;">
          今天是 ${today}，您有 <strong style="color: #e11d48; font-size: 18px;">${coupons.length}</strong> 张优惠券将在 <strong>${days}</strong> 天后到期
        </p>
        <div style="border-top: 1px solid #eee; padding-top: 20px;">
  `

  coupons.forEach((coupon, index) => {
    const endDate = formatExpiryDate(coupon)
    const { text: remainingTime } = calculateRemainingTime(coupon)
    const notes = coupon.notes || "无"

    html += `
      <div style="background: #fff5f5; border-left: 4px solid #e11d48; padding: 16px; margin-bottom: 16px; border-radius: 4px;">
        <h3 style="color: #333; margin: 0 0 8px 0; font-size: 18px;">
          ${index + 1}. ${coupon.title}
        </h3>
        <div style="color: #666; font-size: 14px; line-height: 1.8;">
          <div style="margin-bottom: 4px;">⏰ 剩余时间：<strong style="color: #e11d48;">${remainingTime}</strong></div>
          <div style="margin-bottom: 4px;">📅 到期时间：<strong style="color: #e11d48;">${endDate}</strong></div>
          <div style="margin-bottom: 4px;">📝 备注：${notes}</div>
        </div>
      </div>
    `
  })

  html += `
        </div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
          <p style="color: #999; margin: 0 0 12px 0; font-size: 14px;">
            请及时使用优惠券，避免过期浪费
          </p>
          <a href="https://clq-rosy.vercel.app" style="
            display: inline-block;
            background: linear-gradient(135deg, #e11d48, #be123c);
            color: white;
            padding: 12px 32px;
            text-decoration: none;
            border-radius: 24px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(225, 29, 72, 0.3);
          ">
            📱 查看优惠券详情
          </a>
        </div>
      </div>
    </div>
  `

  return html
}

/**
 * 生成分组的优惠券到期提醒消息
 */
export function generateGroupedExpiringMessage(groups: {
  within1Day: any[]
  within3Days: any[]
  within7Days: any[]
}): string {
  const { within1Day, within3Days, within7Days } = groups
  const totalCoupons = within1Day.length + within3Days.length + within7Days.length

  if (totalCoupons === 0) {
    return ""
  }

  const today = new Date().toLocaleDateString("zh-CN")

  let html = `
    <div style="font-family: 'Microsoft YaHei', sans-serif; padding: 20px; background-color: #f5f5f5;">
      <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #e11d48; margin: 0 0 16px 0; font-size: 24px;">
          🔔 优惠券即将到期提醒
        </h2>
        <p style="color: #666; margin: 0 0 20px 0;">
          今天是 ${today}，您共有 <strong style="color: #e11d48; font-size: 18px;">${totalCoupons}</strong> 张优惠券即将到期
        </p>
        <div style="border-top: 1px solid #eee; padding-top: 20px;">
  `

  // 辅助函数：生成优惠券列表
  const renderCoupons = (coupons: any[], title: string, color: string) => {
    if (coupons.length === 0) return ""

    let sectionHtml = `
      <div style="margin-bottom: 24px;">
        <h3 style="color: ${color}; margin: 0 0 12px 0; font-size: 16px; font-weight: bold;">
          ${title}（${coupons.length}张）
        </h3>
    `

    coupons.forEach((coupon, index) => {
      const endDate = formatExpiryDate(coupon)
      const { text: remainingTime } = calculateRemainingTime(coupon)
      const notes = coupon.notes || "无"

      sectionHtml += `
        <div style="background: #fff5f5; border-left: 4px solid ${color}; padding: 16px; margin-bottom: 12px; border-radius: 4px;">
          <h4 style="color: #333; margin: 0 0 8px 0; font-size: 16px;">
            ${index + 1}. ${coupon.title}
          </h4>
          <div style="color: #666; font-size: 14px; line-height: 1.8;">
            <div style="margin-bottom: 4px;">⏰ 剩余时间：<strong style="color: ${color};">${remainingTime}</strong></div>
            <div style="margin-bottom: 4px;">📅 到期时间：<strong style="color: ${color};">${endDate}</strong></div>
            <div style="margin-bottom: 4px;">📝 备注：${notes}</div>
          </div>
        </div>
      `
    })

    sectionHtml += `</div>`
    return sectionHtml
  }

  // 按紧急程度排序：1天（红色）→ 3天（橙色）→ 7天（黄色）
  html += renderCoupons(within1Day, "🚨 1天内到期", "#e11d48")
  html += renderCoupons(within3Days, "⚠️ 3天内到期", "#f97316")
  html += renderCoupons(within7Days, "📢 7天内到期", "#eab308")

  html += `
        </div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
          <p style="color: #999; margin: 0 0 12px 0; font-size: 14px;">
            请及时使用优惠券，避免过期浪费
          </p>
          <a href="https://clq-rosy.vercel.app" style="
            display: inline-block;
            background: linear-gradient(135deg, #e11d48, #be123c);
            color: white;
            padding: 12px 32px;
            text-decoration: none;
            border-radius: 24px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(225, 29, 72, 0.3);
          ">
            📱 查看优惠券详情
          </a>
        </div>
      </div>
    </div>
  `

  return html
}
