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
}

/**
 * 从文本中提取优惠券信息
 * 使用规则匹配，后续可以替换为AI解析
 */
function extractCouponInfo(text: string): ExtractedCouponInfo {
  const result: ExtractedCouponInfo = {
    description: text.trim(),
  }

  const lines = text.split('\n').map(line => line.trim()).filter(line => line)

  // 1. 提取店铺名称（常见平台和银行）
  const storePatterns = [
    /淘宝|天猫|京东|拼多多|美团|饿了么|盒马|山姆|Costco|永辉|大润发|家乐福|沃尔玛|优衣库|ZARA|H&M|Nike|Adidas/i,
    /建设银行|工商银行|农业银行|中国银行|招商银行|交通银行|中信银行|光大银行|民生银行|平安银行|浦发银行/i,
    /云闪付|银联卡|银联/i,
  ]
  for (const pattern of storePatterns) {
    const match = text.match(pattern)
    if (match) {
      result.storeName = match[0]
      break
    }
  }

  // 2. 提取优惠金额
  // 匹配：减X元、优惠X元、X元券、满减X元、折扣X折、¥X、￥X
  const discountPatterns = [
    /¥\s*(\d+(?:\.\d+)?)/,  // ¥26
    /￥\s*(\d+(?:\.\d+)?)/,  // ￥26
    /减(\d+(?:\.\d+)?)元/,
    /优惠(\d+(?:\.\d+)?)元/,
    /(\d+(?:\.\d+)?)元券/,
    /满减(\d+(?:\.\d+)?)元/,
    /立减(\d+(?:\.\d+)?)元/,
    /抵扣(\d+(?:\.\d+)?)元/,
    /(\d+(?:\.\d+)?)元/,
  ]
  for (const pattern of discountPatterns) {
    const match = text.match(pattern)
    if (match) {
      result.discountAmount = parseFloat(match[1])
      break
    }
  }

  // 3. 提取折扣类型
  // 优先判断满减类型
  if (text.includes('满') && text.includes('可用')) {
    result.discountType = 'full'
  } else if (text.includes('满减') || text.includes('满') && text.includes('减')) {
    result.discountType = 'full'
  } else if (text.includes('折') && !text.includes('满')) {
    result.discountType = 'percentage'
    // 提取折扣数值（例如：8折 = 80%）
    const discountMatch = text.match(/(\d+(?:\.\d+)?)折/)
    if (discountMatch) {
      result.discountAmount = parseFloat(discountMatch[1])
    }
  } else if (text.includes('减免') || text.includes('直减')) {
    result.discountType = 'amount'
  } else {
    result.discountType = 'amount'
  }

  // 4. 提取满减金额
  if (result.discountType === 'full' || text.includes('满')) {
    const fullAmountPatterns = [
      /满¥(\d+(?:\.\d+)?)/,
      /满￥(\d+(?:\.\d+)?)/,
      /满(\d+(?:\.\d+)?)元/,
      /满(\d+(?:\.\d+)?)/,
    ]
    for (const pattern of fullAmountPatterns) {
      const match = text.match(pattern)
      if (match) {
        result.fullAmount = parseFloat(match[1])
        result.discountType = 'full'  // 确保设置为满减类型
        break
      }
    }
  }

  // 5. 提取截止日期
  // 支持格式：
  // - 标准格式：2024-12-31、2024年12月31日、12月31日、12/31、2024.12.31
  // - 日期范围：2025.07.31-2028.07.30、2026/02/23
  // - 带时间的日期范围：2026.01.24 10:51-2026.01.27 10:51
  // - OCR识别格式（可能缺少点号）：2026.012410:51-2026.012710:51
  // - 混合格式：2026.01.25 17:13-2026.0128 17:15
  const datePatterns = [
    // 标准日期范围（横杠/斜杠）
    /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?[-–到至](\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?/,
    // 日期范围（点号分隔，带时间）
    /(\d{4})\.(\d{1,2})\.(\d{1,2})\s*\d{1,2}:\d{2}[-–到至](\d{4})\.(\d{1,2})\.(\d{1,2})/,
    // 日期范围（点号分隔）
    /(\d{4})\.(\d{1,2})\.(\d{1,2})[-–到至](\d{4})\.(\d{1,2})\.(\d{1,2})/,
    // 混合格式日期范围（标准+OCR，带时间）：2026.01.25 17:13-2026.0128 17:15
    /(\d{4})\.(\d{1,2})\.(\d{1,2})\s*\d{1,2}:\d{2}[-–到至](\d{4})\.?(\d{2})(\d{2})(?![.\d])/,
    /(\d{4})\.?(\d{2})(\d{2})\s*\d{1,2}:\d{2}[-–到至](\d{4})\.(\d{1,2})\.(\d{1,2})/,
    // 混合格式日期范围（标准+OCR）：2026.01.25-2026.0128
    /(\d{4})\.(\d{1,2})\.(\d{1,2})[-–到至](\d{4})\.?(\d{2})(\d{2})(?![.\d])/,
    /(\d{4})\.?(\d{2})(\d{2})[-–到至](\d{4})\.(\d{1,2})\.(\d{1,2})/,
    // OCR识别格式（日期时间连在一起）：2026.012410:51-2026.012710:51
    /(\d{4})\.?(\d{2})(\d{2})\d{1,2}:\d{2}[-–到至](\d{4})\.?(\d{2})(\d{2})\d{1,2}:\d{2}/,
    // OCR识别格式（缺少点号，带时间）：2026.0124 10:51-2026.0127 10:51
    /(\d{4})\.?(\d{2})(\d{2})\s*\d{1,2}:\d{2}[-–到至](\d{4})\.?(\d{2})(\d{2})(?![.\d])/,
    /(\d{4})\.?(\d{2})(\d{2})[-–到至](\d{4})\.?(\d{2})(\d{2})(?![.\d])/,
    // 完整日期格式（带年份）
    /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?/,
    /(\d{4})\.(\d{1,2})\.(\d{1,2})/,
    /(\d{4})\.?(\d{2})(\d{2})(?![.\d])/,
    // 短日期格式（不带年份，放在最后）
    /(\d{1,2})[-/月](\d{1,2})[日]?/,
    /(\d{4})[/](\d{1,2})[/](\d{1,2})/,  // 2026/02/23
  ]

  let matchedDate: Date | null = null
  const currentYear = new Date().getFullYear()

  for (const pattern of datePatterns) {
    const match = text.match(pattern)
    if (match) {
      let year, month, day

      if (match.length >= 7) {
        // 日期范围格式：取结束日期
        year = parseInt(match[4])
        month = parseInt(match[5])
        day = parseInt(match[6])
      } else if (match.length === 4) {
        // 完整日期格式：2024-12-31
        year = parseInt(match[1])
        month = parseInt(match[2])
        day = parseInt(match[3])
      } else {
        // 短日期格式：12-31（使用当前年份）
        year = currentYear
        month = parseInt(match[1])
        day = parseInt(match[2])
      }

      // 验证日期有效性
      const date = new Date(year, month - 1, day)
      if (!isNaN(date.getTime())) {
        // 如果短日期且已过期，可能是明年的日期
        if (match.length === 3 && date < new Date()) {
          date.setFullYear(currentYear + 1)
        }
        matchedDate = date
        // 使用本地日期格式化，避免时区问题
        result.endDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        break
      }
    }
  }

  // 6. 提取截止时间（默认23点）
  // 支持格式：23点、23:00、23时，但不能是日期范围中的时间（如 2026.01.24 10:51-2026.01.27 10:51）
  // 只匹配明显是截止时间的格式（后跟"过期"、"可用"等关键词）
  const timePatterns = [
    /(\d{1,2})点(?:过期)?/,
    /(\d{1,2}):(\d{2})(?![\d])/,  // 后面不能跟数字（排除日期范围中的时间）
    /(\d{1,2})时/,
  ]
  for (const pattern of timePatterns) {
    const match = text.match(pattern)
    if (match) {
      const hour = parseInt(match[1])
      // 验证这是一个合理的时间，且不包含在日期范围内
      if (hour >= 0 && hour <= 23) {
        // 检查这个时间后面是不是日期分隔符（如 -、到），如果是则跳过
        const timeIndex = text.indexOf(match[0])
        const nextChars = text.substring(timeIndex + match[0].length, timeIndex + match[0].length + 2)
        if (!nextChars.match(/^[-–到至]/)) {
          result.endHour = hour
          break
        }
      }
    }
  }

  // 默认23点
  if (!result.endHour) {
    result.endHour = 23
  }

  // 8. 提取描述信息（如"饮品通用"、"C1"等）
  // 只有当文本很短（少于50个字符）时，才尝试提取特定行的描述
  // 对于多行文本，保留完整描述
  if (text.trim().length < 50) {
    for (const line of lines) {
      if (line.match(/通用|适用|范围|类型|类别/) && !line.includes('期限')) {
        if (!result.description || result.description === text.trim()) {
          result.description = line
        }
        break
      }
    }
  }
  // 否则保留完整文本作为描述（已经默认设置）

  // 7. 提取标题
  // 优先找包含"立减金"的行
  for (const line of lines) {
    if (line.includes('立减金')) {
      // 提取"立减金"之前的部分作为标题
      const index = line.indexOf('立减金')
      result.title = line.substring(0, index + 3).trim()
      break
    }
  }
  
  // 如果没有找到立减金，尝试找"X 元 券"格式（银联卡优惠券）
  if (!result.title) {
    const yuanQuanPattern = /(\d+(?:\.\d+)?)\s*元\s*券/
    for (const line of lines) {
      const match = line.match(yuanQuanPattern)
      if (match) {
        result.title = match[0] // 例如：0.2 元 券
        break
      }
    }
  }
  
  // 如果还没找到标题，找包含"优惠券"、"券"、"优惠"的行
  if (!result.title) {
    for (const line of lines) {
      if (line.includes('优惠券') || line.includes('券') || line.includes('优惠')) {
        // 排除说明、数量等信息行（但不排除"有效期至"等正常行）
        if (!line.match(/说明|余|张|送TA|红包|无效券|立即使用|充值|建设银行|工商银行|农业银行|中国银行|招商银行|交通银行|储蓄卡/)) {
          // 提取第一个空格前的词作为标题，再去掉"优惠券"后缀
          const firstSpaceIndex = line.indexOf(' ')
          let title = ''
          if (firstSpaceIndex > 0) {
            title = line.substring(0, firstSpaceIndex).trim()
          } else {
            title = line.trim()
          }
          // 去掉"优惠券"、"券"、"优惠"后缀
          title = title.replace(/优惠券|券$/, '').trim()
          if (title) {
            result.title = title
            break
          }
        }
      }
    }
  }
  
  // 如果没有找到合适的标题，使用第一行（但排除纯金额行和银行名称行）
  if (!result.title && lines.length > 0) {
    for (const line of lines) {
      if (!line.match(/^[\d\.¥￥元]+$/) && 
          !line.match(/说明|余|张|送TA|期限|红包|无效券|立即使用|充值|使用|有效期至|可用|建设银行|工商银行|农业银行|中国银行|招商银行|交通银行|储蓄卡|优惠券|券/)) {
        // 提取第一个空格前的词作为标题
        const firstSpaceIndex = line.indexOf(' ')
        if (firstSpaceIndex > 0) {
          result.title = line.substring(0, firstSpaceIndex).trim()
        } else {
          result.title = line
        }
        break
      }
    }
  }

  // 如果还是没有标题，使用店铺名称
  if (!result.title && result.storeName) {
    result.title = result.storeName + '立减金'
  }

  return result
}

/**
 * 使用AI提取优惠券信息
 */
async function extractCouponInfoWithAI(text: string): Promise<ExtractedCouponInfo> {
  const config = new Config()
  const client = new LLMClient(config)

  const systemPrompt = `你是一个专业的优惠券信息提取助手。请从给定的文本中提取优惠券的关键信息，并以JSON格式返回。

支持的输入格式示例：
1. "华香脆骨串优惠券 有效期至2026-01-31 23:59"
2. "淘宝优惠券满100减20元有效期至2024-12-31 23点"
3. "建设银行立减金，满2000减5元，有效期至2024-12-31 23点，饮品通用"
4. "蜜雪冰城饮品优惠券 8折 有效期至2026-01-30"

提取规则：
1. title: 优惠券标题（优先提取店铺/商品名+优惠券类型，如"华香脆骨串优惠券"、"建设银行立减金"）
2. discountAmount: 折扣金额或折扣数值（如减5元则为5，8折则为8）
3. discountType: 折扣类型（amount=减免金额, percentage=折扣, full=满减）
4. fullAmount: 满减金额（仅当discountType为full时需要）
5. endDate: 截止日期，格式为YYYY-MM-DD（如2026-01-31）
6. endHour: 截止小时，0-23之间的整数，默认为23
7. storeName: 店铺或平台名称（从开头提取，如"华香脆骨串"、"淘宝"、"建设银行"、"蜜雪冰城"）
8. description: 描述信息（如"饮品"、"脆骨串"等）

注意事项：
- 日期格式必须为YYYY-MM-DD
- 支持的日期格式：2026-01-31、2026年1月31日、1月31日
- 支持的时间格式：23:59、23点、23时
- 如果文本中没有明确截止时间，endHour默认设为23
- 折扣类型判断：
  - 如果包含"满X可用"、"满X减X"，则为full
  - 如果包含"X折"但不包含"满"，则为percentage
  - 如果包含"减X元"、"减免X元"，则为amount
  - 如果只提到"优惠券"但没有折扣信息，设为null
- 只返回JSON格式，不要包含任何其他文字
- 如果无法提取某个字段，则不包含该字段或设为null

返回JSON格式示例：
{
  "title": "华香脆骨串优惠券",
  "discountAmount": 5,
  "discountType": "full",
  "fullAmount": 2000,
  "endDate": "2026-01-31",
  "endHour": 23,
  "storeName": "华香脆骨串",
  "description": "脆骨串"
}`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: `请提取以下优惠券信息：\n\n${text}` },
  ]

  try {
    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.3, // 较低的温度以获得更准确的提取结果
    })

    // 解析AI返回的JSON
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsedData = JSON.parse(jsonMatch[0])
      
      // 验证和转换数据
      const result: ExtractedCouponInfo = {}
      
      if (parsedData.title) result.title = parsedData.title
      if (parsedData.storeName) result.storeName = parsedData.storeName
      if (parsedData.description) result.description = parsedData.description
      if (parsedData.discountAmount) result.discountAmount = Number(parsedData.discountAmount)
      if (parsedData.fullAmount) result.fullAmount = Number(parsedData.fullAmount)
      if (parsedData.endDate) result.endDate = parsedData.endDate
      if (parsedData.endHour) result.endHour = Number(parsedData.endHour)
      
      // 验证折扣类型
      if (parsedData.discountType && ['amount', 'percentage', 'full'].includes(parsedData.discountType)) {
        result.discountType = parsedData.discountType
      }
      
      // 如果AI没有提取到完整信息，回退到规则匹配
      if (!result.title || !result.discountAmount || !result.discountType) {
        console.log('AI提取不完整，回退到规则匹配')
        return extractCouponInfo(text)
      }
      
      return result
    } else {
      console.log('AI返回格式错误，回退到规则匹配')
      return extractCouponInfo(text)
    }
  } catch (error) {
    console.error('AI解析失败，回退到规则匹配:', error)
    return extractCouponInfo(text)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, useAI } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: '请提供文本内容' },
        { status: 400 }
      )
    }

    // 根据参数选择提取方式
    let extractedInfo: ExtractedCouponInfo
    if (useAI === true) {
      extractedInfo = await extractCouponInfoWithAI(text)
    } else {
      extractedInfo = extractCouponInfo(text)
    }

    return NextResponse.json({
      success: true,
      data: extractedInfo,
    })
  } catch (error) {
    console.error('解析优惠券失败:', error)
    return NextResponse.json(
      { success: false, error: '解析失败' },
      { status: 500 }
    )
  }
}
