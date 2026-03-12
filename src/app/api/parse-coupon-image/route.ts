import { NextRequest, NextResponse } from "next/server"
import OpenAI from 'openai'
import { toLocalISOString, formatLocalDate } from "@/lib/datetime-utils"

/**
 * 使用ChatGPT视觉能力从图片中提取优惠券信息
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传图片' },
        { status: 400 }
      )
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: '请上传图片文件' },
        { status: 400 }
      )
    }

    // 将图片转换为base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64Image = buffer.toString('base64')
    const mimeType = file.type
    const dataUrl = `data:${mimeType};base64,${base64Image}`

    // 调用ChatGPT进行识别
    return await extractWithChatGPT(dataUrl)
  } catch (error) {
    console.error('图片识别失败:', error)
    return NextResponse.json(
      { success: false, error: '图片识别失败' },
      { status: 500 }
    )
  }
}

/**
 * 使用ChatGPT进行图片识别
 */
async function extractWithChatGPT(imageDataUrl: string): Promise<NextResponse> {
  try {
    const API_KEY = process.env.CHATGPT_API_KEY

    if (!API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'ChatGPT API Key 未配置',
        details: {
          errorCode: 'missing_api_key',
          suggestion: '请访问 https://free.v36.cm/github 领取免费API Key，并在环境变量中配置 CHATGPT_API_KEY'
        }
      }, { status: 400 })
    }

    console.log('ChatGPT API调用开始，图片URL长度:', imageDataUrl.length)

    const openai = new OpenAI({
      apiKey: API_KEY,
      baseURL: 'https://free.v36.cm/v1/',
    })

    const prompt = `你是一个优惠券OCR结构化提取助手。
任务：识别图片中的所有优惠券信息，并返回严格JSON格式数据。

⚠️ 重要规则：
1. 只返回 JSON
2. 不要输出解释
3. 不要输出代码块
4. 不要添加任何额外文字
5. 所有字段必须存在
6. 不允许缺失字段

返回格式必须严格为：
{
  "coupons": [
    {
      "title": string,
      "description": string,
      "discountType": "amount" | "full" | null,
      "discountAmount": number | null,
      "fullAmount": number | null,
      "startDate": string,
      "expiryDate": string,
      "endHour": number,
      "endMinute": number,
      "notes": string | null,
      "storeName": string | null
    }
  ]
}

字段规则：

【title】优惠券名称（必须包含店铺名称，格式：店铺名称+优惠描述）
- 建设银行立减金
- 古茗20元代金券
- 蜜雪冰城奶茶券
- 瑞幸咖啡 20元立减金
- 建设银行 满2000减5
- 星巴克 8折优惠券

【description】图片中相关文字的简要摘要，没有则 ""

【discountType】
- 无门槛 / 立减 → "amount"
- 满50减10 → "full"
- 无法判断 → null

【discountAmount】
- 立减金额
- 满减中的减免金额
- 无法识别则 null

【fullAmount】
- 满减门槛金额
- 非满减则 null

【startDate】
- 格式：YYYY-MM-DD（纯日期，不带时间）
- 如果未明确给出，使用今天日期

【expiryDate】
- 格式：YYYY-MM-DD（纯日期，不带时间）
- 支持：2026年3月8日、2026/03/08、2026-03-08、3月8日（默认当前年份）
- ⚠️ 必须返回纯日期格式，不要带时间，不要带Z，不要带+08:00

【endHour】
- 默认 23
- 仅当图片中明确显示截止时间时才填写

【endMinute】
- 默认 59
- 仅当图片中明确显示截止分钟时才填写

【storeName】
- 商家名称
- 无法识别则 null

【notes】
- 额外信息
- 无则 null

现在开始识别图片。`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      temperature: 0.3,
    })

    console.log('ChatGPT API响应成功')

    const raw = response.choices[0]?.message?.content?.trim() || ''

    console.log('ChatGPT图片识别结果:', raw)

    // 解析提取的JSON
    let coupons = parseExtractedJSON(raw)

    // 打印原始数据，方便调试
    console.log('ChatGPT返回的原始优惠券数据:', JSON.stringify(coupons, null, 2))

    // 安全补字段：确保所有字段都有默认值
    const today = formatLocalDate(new Date())

    const normalized = coupons.map((c: any, index: number) => {
      // 获取日期：优先使用 expiryDate，其次 endDate
      // 确保只保留日期部分（YYYY-MM-DD）
      let processedStartDate = c.startDate ?? today
      let processedEndDate = c.expiryDate || c.endDate || today

      console.log(`[${index}] AI返回原始数据:`, {
        startDate: c.startDate,
        endDate: c.endDate,
        expiryDate: c.expiryDate,
        endHour: c.endHour,
        endMinute: c.endMinute
      })

      // 提取日期部分（如果是带时间的格式，只取日期）
      const extractDate = (dateStr: string): string => {
        if (dateStr.includes('T')) {
          return dateStr.split('T')[0]
        }
        // 如果带Z后缀，先解析再提取日期
        if (dateStr.endsWith('Z')) {
          const d = new Date(dateStr)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        return dateStr
      }

      processedStartDate = extractDate(processedStartDate)
      processedEndDate = extractDate(processedEndDate)

      console.log(`[${index}] 处理后:`, { 
        startDate: processedStartDate, 
        endDate: processedEndDate, 
        endHour: c.endHour ?? 23, 
        endMinute: c.endMinute ?? 59 
      })

      return {
        id: crypto.randomUUID(),
        title: c.title ?? "",
        description: c.description ?? "",
        discountType: c.discountType ?? null,
        discountAmount: c.discountAmount ?? null,
        fullAmount: c.fullAmount ?? null,
        startDate: processedStartDate,
        endDate: processedEndDate,  // 只存储日期 YYYY-MM-DD
        endHour: c.endHour ?? 23,
        endMinute: c.endMinute ?? 59,
        notes: c.notes ?? null,
        storeName: c.storeName ?? null,
        isReminded: false,
        remindedDays: [],
        isUsed: false,
        createdAt: toLocalISOString(new Date()),
        updatedAt: toLocalISOString(new Date()),
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        coupons: normalized,
    aiModel: 'chatgpt'
  }
})
  } catch (error: any) {
    console.error('ChatGPT识别失败:', error)

    if (error?.status === 401) {
      return NextResponse.json({
        success: false,
        error: 'ChatGPT API Key 无效或已过期'
      }, { status: 401 })
    }

    return NextResponse.json({
      success: false,
      error: 'ChatGPT识别失败'
    }, { status: 500 })
  }
}

/**
 * 解析提取的JSON为优惠券数组
 */
function parseExtractedJSON(jsonText: string): Array<{
  storeName: string | null
  title: string
  description: string
  discountType: 'amount' | 'full' | null
  discountAmount: number | null
  fullAmount: number | null
  startDate: string
  endDate: string
  endHour: number
  endMinute: number
  notes: string | null
}> {
  try {
    // 提取JSON内容（去除可能的markdown代码块标记）
    let cleanedText = jsonText.trim()

    // 移除 ```json 和 ``` 标记
    cleanedText = cleanedText.replace(/```json/g, '').replace(/```/g, '')

    // 解析JSON
    const data = JSON.parse(cleanedText)

    if (!data || !Array.isArray(data.coupons)) {
      console.error('解析失败：无效的JSON格式', data)
      return []
    }

    return data.coupons.map((coupon: any) => ({
      storeName: coupon.storeName || null,
      title: coupon.title || '',
      description: coupon.description || '',
      discountType: coupon.discountType || null,
      discountAmount: coupon.discountAmount || null,
      fullAmount: coupon.fullAmount || null,
      startDate: coupon.startDate || formatLocalDate(new Date()),
      endDate: coupon.expiryDate || coupon.endDate || '',
      endHour: coupon.endHour || 23,
      endMinute: coupon.endMinute || 59,
      notes: coupon.notes || null
    }))
  } catch (error) {
    console.error('JSON解析失败:', error)
    console.error('原始文本:', jsonText)
    return []
  }
}
