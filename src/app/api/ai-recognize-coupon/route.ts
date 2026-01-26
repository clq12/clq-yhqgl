import { NextRequest, NextResponse } from "next/server"
import { LLMClient, Config } from 'coze-coding-dev-sdk'

export interface ExtractedCouponInfo {
  title?: string
  discountAmount?: number
  discountType?: 'amount' | 'percentage' | 'full'
  fullAmount?: number
  endDate?: string
  endHour?: number
  storeName?: string
  description?: string
  notes?: string
}

/**
 * AI识别优惠券API
 * 使用豆包大语言模型的视觉能力，直接从图片中提取优惠券信息
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { imageBase64, text } = body

    if (!imageBase64 && !text) {
      return NextResponse.json(
        { success: false, error: '请提供图片或文本' },
        { status: 400 }
      )
    }

    const config = new Config()
    const client = new LLMClient(config)

    // 构建系统提示词
    const systemPrompt = `你是一个专业的优惠券识别助手。请从图片或文本中提取优惠券信息，并严格按照JSON格式返回。

请提取以下字段：
1. title: 优惠券标题（如"建设银行立减金"、"淘宝优惠券"等）
2. discountAmount: 优惠金额（数字）
3. discountType: 折扣类型（amount-减免, percentage-折扣, full-满减）
4. fullAmount: 满减金额（仅当discountType为full时）
5. endDate: 截止日期（YYYY-MM-DD格式）
6. endHour: 截止小时（0-23，默认23）
7. storeName: 店铺/银行名称
8. description: 描述信息（如适用范围、使用说明等）
9. notes: 备注信息

识别规则：
- "满X减Y" → discountType: "full", discountAmount: Y, fullAmount: X
- "X折" → discountType: "percentage", discountAmount: X
- "减X元"、"立减X元" → discountType: "amount", discountAmount: X
- 日期格式支持：2024-12-31、2024年12月31日、12月31日
- 日期范围（如2025.07.31-2028.07.30）取结束日期
- 如果找不到某个字段，设为null或省略

请只返回JSON格式的数据，不要添加任何其他文字说明。`

    // 构建用户消息
    const userContent: any[] = [
      { type: 'text', text: '请识别这张优惠券图片/文本，提取优惠券信息。' }
    ]

    if (imageBase64) {
      // 确保Base64格式正确
      const dataUri = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
      userContent.push({
        type: 'image_url',
        image_url: {
          url: dataUri,
          detail: 'high'
        }
      })
    }

    if (text) {
      userContent.push({ type: 'text', text: `\n\n文本内容：\n${text}` })
    }

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userContent }
    ]

    // 使用视觉模型进行识别
    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-6-vision-250815',
      temperature: 0.3, // 使用较低的温度，提高准确性和一致性
    })

    // 解析AI返回的JSON
    const aiResponse = response.content.trim()
    
    // 尝试提取JSON（可能包含代码块标记）
    let jsonStr = aiResponse
    const codeBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1]
    }

    // 尝试找到第一个 { 和最后一个 } 之间的内容
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1)
    }

    let extractedInfo: ExtractedCouponInfo
    try {
      extractedInfo = JSON.parse(jsonStr)
    } catch (parseError) {
      console.error('JSON解析失败:', jsonStr)
      return NextResponse.json(
        { success: false, error: 'AI返回数据格式错误' },
        { status: 500 }
      )
    }

    // 数据后处理
    const processedInfo: ExtractedCouponInfo = {
      title: extractedInfo.title || '未知优惠券',
      discountAmount: extractedInfo.discountAmount,
      discountType: extractedInfo.discountType || 'amount',
      fullAmount: extractedInfo.fullAmount,
      endDate: extractedInfo.endDate,
      endHour: extractedInfo.endHour ?? 23,
      storeName: extractedInfo.storeName,
      description: extractedInfo.description,
      notes: extractedInfo.notes
    }

    return NextResponse.json({
      success: true,
      data: processedInfo
    })

  } catch (error) {
    console.error('AI识别失败:', error)
    return NextResponse.json(
      { success: false, error: 'AI识别失败，请重试' },
      { status: 500 }
    )
  }
}
