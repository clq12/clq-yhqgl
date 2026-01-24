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
 * 生成优惠券到期提醒消息
 */
export function generateExpiringMessage(coupons: any[], days: number): string {
  if (coupons.length === 0) {
    return ""
  }

  let html = `<h3>🎉 您有 ${coupons.length} 张优惠券即将到期（${days}天）</h3>`
  html += "<ul>"

  coupons.forEach((coupon) => {
    const endDate = new Date(coupon.endDate).toLocaleDateString("zh-CN")
    const discount = coupon.discountAmount
      ? `${coupon.discountAmount}元`
      : "查看详情"

    html += `<li>
      <strong>${coupon.title}</strong><br/>
      到期时间：${endDate}<br/>
      优惠力度：${discount}<br/>
      ${coupon.description ? `备注：${coupon.description}` : ""}
    </li>`
  })

  html += "</ul>"
  html += "<p>📱 点击查看详情：<a href='https://你的应用地址.vercel.app'>优惠券管理应用</a></p>"

  return html
}
