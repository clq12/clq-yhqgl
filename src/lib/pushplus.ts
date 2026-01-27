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
export async function sendPushPlus(message: PushPlusMessage): Promise<boolean> {
  try {
    const url = "http://www.pushplus.plus/send"

    const params = new URLSearchParams({
      token: message.token,
      title: message.title,
      content: message.content,
      template: message.template || "html",
    })

    const response = await fetch(`${url}?${params.toString()}`, {
      method: "GET",
    })

    const result = await response.json()

    return result.code === 200
  } catch (error) {
    console.error("PushPlus 推送失败:", error)
    return false
  }
}

/**
 * 计算剩余天数和小时数
 */
function calculateRemainingTime(coupon: any): { days: number; hours: number; text: string } {
  const now = new Date()
  const endDate = new Date(coupon.endDate)

  // 设置截止时间的小时
  const endHour = coupon.endHour ?? 23
  endDate.setHours(endHour, 0, 0, 0)

  const diffMs = endDate.getTime() - now.getTime()

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
    const endDate = new Date(coupon.endDate).toLocaleDateString("zh-CN")
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
          <a href="#" style="
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
