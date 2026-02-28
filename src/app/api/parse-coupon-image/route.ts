import { NextRequest, NextResponse } from "next/server"
import OpenAI from 'openai'

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

    const prompt = `你是一个专业的优惠券页面结构化提取助手。

当前图片"优惠券/订单列表"截图，
页面通常包含：
- 商家名称（在顶部或卡片左上）
- 优惠金额（如 ¥18）
- 优惠类型（立减金 / 满减券 / 商品券 / 套餐券 等）
- 使用门槛（如 满18.01可用 / 满50减10）
- 有效期（如 有效期至2026/03/10 23:59）

你的任务：
提取图片中所有可见优惠券或订单信息。

必须提取字段：
1. 商家名称
2. 优惠名称（若无明确名称，用"立减金/满减券"等类型代替）
3. 优惠条件（如 满18减18；无门槛则写 无门槛）
4. 到期时间（统一转为：YYYY年M月D日 或 YYYY年M月D日 HH:MM）

时间处理规则：
- "有效期至2026/03/10 23:59" → 2026年3月10日 23:59
- "有效期至2026-03-08" → 2026年3月8日
- 只写截止时间，不写"有效期至"

输出规则：
- 每行一条
- 不加编号
- 不加解释
- 不输出多余文字
- 不合并多条
- 如果同一商家有多张券，分别输出

标准输出格式：
商家 优惠名称 优惠条件 到期时间

开始处理图片。`

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

    const extractedText = response.choices[0]?.message?.content?.trim() || ''

    console.log('ChatGPT图片识别结果:', extractedText)

    // 解析提取的文本
    const coupons = parseExtractedText(extractedText)

    return NextResponse.json({
      success: true,
      data: {
        rawText: extractedText,
        coupons: coupons,
        aiModel: 'chatgpt'
      }
    })
  } catch (error: any) {
    console.error('ChatGPT识别失败:', error)

    // 检查是否是API Key错误
    if (error?.status === 401) {
      return NextResponse.json({
        success: false,
        error: 'ChatGPT API Key 无效或已过期',
        details: {
          errorCode: 'invalid_api_key',
          suggestion: '请访问 https://free.v36.cm/github 重新获取免费API Key，并在环境变量中配置 CHATGPT_API_KEY'
        }
      }, { status: 401 })
    }

    throw error
  }
}

/**
 * 解析提取的文本为优惠券数组
 */
function parseExtractedText(text: string): Array<{
  storeName: string
  title: string
  condition: string
  endDate: string
}> {
  const coupons: Array<{
    storeName: string
    title: string
    condition: string
    endDate: string
  }> = []

  // 按行分割
  const lines = text.split('\n').map(line => line.trim()).filter(line => line)

  for (const line of lines) {
    // 尝试解析格式：商家 优惠名称 优惠条件 到期时间
    // 日期时间正则：匹配 YYYY年M月D日 或 YYYY年M月D日 HH:MM
    const datePattern = /(\d{4}年\d{1,2}月\d{1,2}日(?:\s+\d{1,2}:\d{1,2})?)/
    const dateMatch = line.match(datePattern)

    if (dateMatch) {
      const endDate = dateMatch[0]
      const remainingText = line.replace(datePattern, '').trim()

      // 按空格分割剩余文本
      const parts = remainingText.split(/\s+/).filter(p => p)

      if (parts.length >= 3) {
        // 商家 优惠名称 优惠条件
        coupons.push({
          storeName: parts[0],
          title: parts[1],
          condition: parts.slice(2).join(' '),
          endDate: endDate
        })
      } else if (parts.length === 2) {
        // 商家 优惠名称（无优惠条件）
        coupons.push({
          storeName: parts[0],
          title: parts[1],
          condition: '',
          endDate: endDate
        })
      } else if (parts.length === 1) {
        // 只有商家
        coupons.push({
          storeName: parts[0],
          title: '',
          condition: '',
          endDate: endDate
        })
      }
    } else {
      // 没有找到日期，尝试简单分割
      const parts = line.split(/\s+/).filter(p => p)
      if (parts.length >= 3) {
        coupons.push({
          storeName: parts[0],
          title: parts[1],
          condition: parts.slice(2).join(' '),
          endDate: ''
        })
      } else if (parts.length >= 2) {
        coupons.push({
          storeName: parts[0],
          title: parts.slice(1).join(' '),
          condition: '',
          endDate: ''
        })
      } else if (parts.length === 1) {
        coupons.push({
          storeName: parts[0],
          title: '',
          condition: '',
          endDate: ''
        })
      }
    }
  }

  return coupons
}
