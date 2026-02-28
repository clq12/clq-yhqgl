import { NextRequest, NextResponse } from "next/server"
import { LLMClient, Config } from 'coze-coding-dev-sdk'

export interface ExtractedCouponInfo {
  title?: string
  discountAmount?: number
  discountType?: 'amount' | 'percentage' | 'full'
  fullAmount?: number
  startDate?: string
  endDate?: string
  endHour?: number
  endMinute?: number
  storeName?: string
  description?: string
  notes?: string
  aiModel?: 'glm' | 'doubao' | 'rule' | 'chatgpt' // 使用的AI模型
  rawResponse?: string // AI模型的原始返回值
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
  } else if (text.includes('满') && /满[\d\.]+-\d+/.test(text)) {
    // 满X-Y 格式：满5.01-5
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

  // 4.5 提取满X-Y格式的折扣金额
  // 例如：满5.01-5，满100-20
  if (result.discountType === 'full' && !result.discountAmount) {
    const manJianPattern = /满(\d+(?:\.\d+)?)\s*[-]\s*(\d+(?:\.\d+)?)/
    const match = text.match(manJianPattern)
    if (match) {
      result.fullAmount = parseFloat(match[1])
      result.discountAmount = parseFloat(match[2])
    }
  }

  // 5. 提取截止日期
  // 支持格式：
  // - 标准格式：2024-12-31、2024年12月31日、12月31日、12/31、2024.12.31
  // - 日期范围：2025.07.31-2028.07.30、2026/02/23
  // - 带时间的日期范围：2026.01.24 10:51-2026.01.27 10:51
  // - OCR识别格式（可能缺少点号）：2026.012410:51-2026.012710:51
  // - 混合格式：2026.01.25 17:13-2026.0128 17:15
  // - 月份.日期格式：1.30过期、2.5到期、3.15失效、4.20作废
  // - 本月日期格式：这个月30过期、本月15号到期（支持"过期/到期/失效/作废"）
  // - 相对天数格式：3天后过期、7天后到期、29天后失效（支持"过期/到期/失效/作废"）
  // - 下月日期格式：下个月5号过期、下月1号到期（支持"过期/到期/失效/作废"）
  // - 有效期格式：有效期至2026-01-31、有效期2026-01-31
  // - 今天明天格式：今天到期、明天失效（支持"下午/上午/晚上"）
  // - 本周下周格式：本周日作废、下周一下午3点失效
  // - 月底格式：本月底过期、下月底作废
  // - 季度格式：下个季度初失效
  // - 之前使用格式：2026-03-15之前使用（不包含当日，日期减1天）

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1  // 1-12
  const currentDay = now.getDate()

  // 优先检查相对日期格式（这个月、下月、N天后）
  let matchedDate: Date | null = null

  // 检查"这个月30过期"、"本月15号到期"等格式
  const thisMonthPattern = /(?:这个|本)月\s*(\d{1,2})\s*(?:号|日)?\s*(?:过期|到期|失效|作废|$)/
  const thisMonthMatch = text.match(thisMonthPattern)
  if (thisMonthMatch) {
    const day = parseInt(thisMonthMatch[1])
    const date = new Date(currentYear, currentMonth - 1, day)
    if (!isNaN(date.getTime())) {
      matchedDate = date
      result.endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // 检查"下个月5号过期"、"下月1号"等格式
  const nextMonthPattern = /下(?:个)?月\s*(\d{1,2})\s*(?:号|日)?\s*(?:过期|到期|失效|作废|$)/
  const nextMonthMatch = text.match(nextMonthPattern)
  if (nextMonthMatch && !matchedDate) {
    const day = parseInt(nextMonthMatch[1])
    const nextMonthDate = new Date(currentYear, currentMonth, day)  // currentMonth + 1
    if (!isNaN(nextMonthDate.getTime())) {
      matchedDate = nextMonthDate
      result.endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // 检查"X月X号到期"、"X月X日到期"等格式（例如：1月30号到期、2月5日到期）
  const monthDayPattern = /(\d{1,2})月\s*(\d{1,2})\s*(?:号|日)\s*(?:过期|到期|失效|作造|作废|$)/
  const monthDayMatch = text.match(monthDayPattern)
  if (monthDayMatch && !matchedDate) {
    const month = parseInt(monthDayMatch[1])
    const day = parseInt(monthDayMatch[2])

    // 使用当前年份（不自动调整为下年，因为用户可能输入历史数据）
    const year = currentYear

    const date = new Date(year, month - 1, day)
    if (!isNaN(date.getTime())) {
      matchedDate = date
      result.endDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // 检查"N天后过期"、"N天后"、"N天后到期"等格式
  const daysLaterPattern = /(\d+)\s*天后\s*(?:过期|到期|失效|作废|$)/
  const daysLaterMatch = text.match(daysLaterPattern)
  if (daysLaterMatch && !matchedDate) {
    const days = parseInt(daysLaterMatch[1])
    const futureDate = new Date(now)
    futureDate.setDate(futureDate.getDate() + days)
    if (!isNaN(futureDate.getTime())) {
      matchedDate = futureDate
      result.endDate = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`
    }
  }

  // 检查"有效期至X"、"有效期X"等格式（如：有效期至2026-01-31、有效期2026-01-31）
  const validityPattern = /(?:有效期)\s*(?:至|截止)?\s*(\d{4})[-/年\.](\d{1,2})[-/月\.](\d{1,2})(?:[日号]|$)/
  const validityMatch = text.match(validityPattern)
  if (validityMatch && !matchedDate) {
    const year = parseInt(validityMatch[1])
    const month = parseInt(validityMatch[2])
    const day = parseInt(validityMatch[3])
    const date = new Date(year, month - 1, day)
    if (!isNaN(date.getTime())) {
      matchedDate = date
      result.endDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // 检查"今天到期"、"明天失效"、"后天过期"等格式
  const todayTomorrowPattern = /(?:今|明|后)天\s*(?:下午|上午|晚上|中午)?\s*(\d{1,2}\s*点(?:\s*\d{1,2}\s*分)?)?\s*(?:过期|到期|失效|作造|作废)/
  const todayTomorrowMatch = text.match(todayTomorrowPattern)
  if (todayTomorrowMatch && !matchedDate) {
    const keyword = todayTomorrowMatch[0].substring(0, 2) // "今天"、"明天"或"后天"
    const targetDate = new Date(now)
    if (keyword === '明天') {
      targetDate.setDate(targetDate.getDate() + 1)
    } else if (keyword === '后天') {
      targetDate.setDate(targetDate.getDate() + 2)
    }
    // 如果包含时间信息（如"中午12点"），提取时间
    const timeText = todayTomorrowMatch[0].substring(2) // "中午12点"部分
    if (timeText) {
      // 检查AM/PM格式
      let isPM = timeText.includes('下午') || timeText.includes('晚')
      let isAM = timeText.includes('上午') || timeText.includes('早')
      let isNoon = timeText.includes('中午')
      
      // 提取小时和分钟
      const timePattern = /(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分)?/
      const timeMatch = timeText.match(timePattern)
      if (timeMatch) {
        const hour = parseInt(timeMatch[1])
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0

        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          // 处理AM/PM格式
          let finalHour = hour
          if (isPM && hour < 12) {
            finalHour = hour + 12  // 下午3点 = 15点
          } else if (isAM && hour === 12) {
            finalHour = 0  // 上午12点 = 0点
          }
          // 中午保持原样
          if (isNoon) {
            finalHour = hour
          }

          result.endHour = finalHour
          result.endMinute = minute
        }
      }
    }
    
    if (!isNaN(targetDate.getTime())) {
      matchedDate = targetDate
      result.endDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    }
  }

  // 检查"本周日作废"、"下周一下午3点15分失效"等格式
  const weekDayPattern = /(?:本|下)周\s*(?:一|二|三|四|五|六|日|天|周末)\s*(?:下午|上午|晚上)?\s*(?:\d{1,2}\s*点(?:\s*\d{1,2}\s*分)?)?\s*(?:过期|到期|失效|作废)/
  const weekDayMatch = text.match(weekDayPattern)
  if (weekDayMatch && !matchedDate) {
    const weekKeyword = weekDayMatch[0].substring(0, 2) // "本周"或"下周"
    const restText = weekDayMatch[0].substring(2) // 剩余文本
    
    // 提取星期几（一=1, 二=2, ... 六=6, 日/天=0, 周末=6或0）
    let targetDay = 0
    if (restText.includes('一')) targetDay = 1
    else if (restText.includes('二')) targetDay = 2
    else if (restText.includes('三')) targetDay = 3
    else if (restText.includes('四')) targetDay = 4
    else if (restText.includes('五')) targetDay = 5
    else if (restText.includes('六')) targetDay = 6
    else if (restText.includes('日') || restText.includes('天')) targetDay = 0
    else if (restText.includes('周末')) targetDay = 6 // 周末默认周六
    
    // 计算目标日期
    const currentDayOfWeek = now.getDay() // 0-6
    const targetDate = new Date(now)
    
    if (weekKeyword === '本周') {
      // 本周的目标日
      const daysUntilTarget = targetDay - currentDayOfWeek
      if (daysUntilTarget >= 0) {
        targetDate.setDate(targetDate.getDate() + daysUntilTarget)
      } else {
        // 已经过了本周的这一天，应该是下周的同一天
        targetDate.setDate(targetDate.getDate() + daysUntilTarget + 7)
      }
    } else {
      // 下周：明确是下周，不管本周是否已经有这一天
      const daysUntilTarget = targetDay - currentDayOfWeek
      targetDate.setDate(targetDate.getDate() + daysUntilTarget + 7)
    }

    // 提取时间信息（如果有）
    // 检查AM/PM格式
    let isPM = restText.includes('下午') || restText.includes('晚')
    let isAM = restText.includes('上午') || restText.includes('早')

    // 提取小时和分钟
    const timePattern = /(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分)?/
    const timeMatch = restText.match(timePattern)
    if (timeMatch) {
      const hour = parseInt(timeMatch[1])
      const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0

      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        // 处理AM/PM格式
        let finalHour = hour
        if (isPM && hour < 12) {
          finalHour = hour + 12  // 下午3点 = 15点
        } else if (isAM && hour === 12) {
          finalHour = 0  // 上午12点 = 0点
        }

        result.endHour = finalHour
        result.endMinute = minute
      }
    }

    if (!isNaN(targetDate.getTime())) {
      matchedDate = targetDate
      result.endDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    }
  }

  // 检查"周六过期"、"周一到期"等格式（没有"本周"或"下周"前缀，需要判断本周还是下周）
  const weekDayNoPrefixPattern = /(?:周)(?:一|二|三|四|五|六|日|天)\s*(?:下午|上午|晚上)?\s*(?:\d{1,2}\s*点(?:\s*\d{1,2}\s*分)?)?\s*(?:过期|到期|失效|作废|$)/
  const weekDayNoPrefixMatch = text.match(weekDayNoPrefixPattern)
  if (weekDayNoPrefixMatch && !matchedDate) {
    const restText = weekDayNoPrefixMatch[0]
    
    // 提取星期几（一=1, 二=2, ... 六=6, 日/天=0）
    let targetDay = 0
    if (restText.includes('一')) targetDay = 1
    else if (restText.includes('二')) targetDay = 2
    else if (restText.includes('三')) targetDay = 3
    else if (restText.includes('四')) targetDay = 4
    else if (restText.includes('五')) targetDay = 5
    else if (restText.includes('六')) targetDay = 6
    else if (restText.includes('日') || restText.includes('天')) targetDay = 0
    
    // 判断是本周还是下周
    // 规则：如果目标星期几 > 当前星期几，就是本周；否则是下周
    // 例如：现在是周三（3），说"周一"（1），因为 1 <= 3，所以是下周一
    //      现在是周三（3），说"周六"（6），因为 6 > 3，所以是本周六
    //      现在是周日（0），说"周一"（1），因为 1 > 0，所以是本周一
    const currentDayOfWeek = now.getDay() // 0-6
    const targetDate = new Date(now)
    
    const daysUntilTarget = targetDay - currentDayOfWeek
    if (daysUntilTarget > 0) {
      // 目标日还没有到，是本周
      targetDate.setDate(targetDate.getDate() + daysUntilTarget)
    } else {
      // 目标日已经过了（或就是今天），是下周
      targetDate.setDate(targetDate.getDate() + daysUntilTarget + 7)
    }

    // 提取时间信息（如果有）
    // 检查AM/PM格式
    let isPM = restText.includes('下午') || restText.includes('晚')
    let isAM = restText.includes('上午') || restText.includes('早')

    // 提取小时和分钟
    const timePattern = /(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分)?/
    const timeMatch = restText.match(timePattern)
    if (timeMatch) {
      const hour = parseInt(timeMatch[1])
      const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0

      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        // 处理AM/PM格式
        let finalHour = hour
        if (isPM && hour < 12) {
          finalHour = hour + 12  // 下午3点 = 15点
        } else if (isAM && hour === 12) {
          finalHour = 0  // 上午12点 = 0点
        }

        result.endHour = finalHour
        result.endMinute = minute
      }
    }

    if (!isNaN(targetDate.getTime())) {
      matchedDate = targetDate
      result.endDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    }
  }

  // 检查"本月底过期"、"下月底作废"等格式
  const monthEndPattern = /(?:本|下)月\s*底\s*(?:过期|到期|失效|作废)/
  const monthEndMatch = text.match(monthEndPattern)
  if (monthEndMatch && !matchedDate) {
    const monthKeyword = monthEndMatch[0].substring(0, 2) // "本月"或"下月"
    const targetDate = new Date(now)
    
    if (monthKeyword === '本月') {
      // 本月最后一天
      targetDate.setMonth(targetDate.getMonth() + 1, 0)
    } else {
      // 下月最后一天
      targetDate.setMonth(targetDate.getMonth() + 2, 0)
    }
    
    if (!isNaN(targetDate.getTime())) {
      matchedDate = targetDate
      result.endDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    }
  }

  // 检查"下个季度初失效"等格式
  const nextQuarterPattern = /下个季度\s*(?:初|开始)\s*(?:过期|到期|失效|作废)/
  const nextQuarterMatch = text.match(nextQuarterPattern)
  if (nextQuarterMatch && !matchedDate) {
    const currentMonth = now.getMonth() // 0-11
    const targetDate = new Date(now)
    
    // 计算下个季度的第一个月
    const currentQuarter = Math.floor(currentMonth / 3) // 0, 1, 2, 3
    const nextQuarter = (currentQuarter + 1) % 4
    const targetYear = nextQuarter === 0 ? now.getFullYear() + 1 : now.getFullYear()
    const targetMonth = nextQuarter * 3
    
    targetDate.setFullYear(targetYear, targetMonth, 1)
    
    if (!isNaN(targetDate.getTime())) {
      matchedDate = targetDate
      result.endDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
    }
  }

  // 如果没有匹配到相对日期，再检查标准日期格式
  if (!matchedDate) {
    const datePatterns = [
      // 日期范围格式（横杠/斜杠）
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
      // 月份.日期过期格式：1.30过期、2.5到期、3.15失效、4.20作废
      /(\d{1,2})\.(\d{1,2})(?:\s*(?:过期|到期|失效|作废)|$)/,
    ]

    for (const pattern of datePatterns) {
      const match = text.match(pattern)
      if (match) {
        console.log('Date pattern matched:', pattern)
        console.log('Match result:', match)
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
          // 但对于明确带有"过期/到期/失效/作废"关键字的格式，不自动调整
          const hasExpiryKeyword = /(?:过期|到期|失效|作废)/.test(text.substring(match.index || 0))
          if (match.length === 3 && date < new Date() && !hasExpiryKeyword) {
            date.setFullYear(currentYear + 1)
          }
          matchedDate = date

          // 检查是否包含"之前使用"关键词（不包含当日，日期减1天）
          if (text.includes('之前使用')) {
            date.setDate(date.getDate() - 1)
          }
          
          // 使用本地日期格式化，避免时区问题
          result.endDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          break
        }
      }
    }
  }

  // 6. 提取截止时间（默认23点59分）
  // 支持格式：
  // - 23点、23点30分、23:30、23时、23时30分
  // - 下午3点、下午3点15分、上午10点、上午10点30分
  // - 但不能是日期范围中的时间（如 2026.01.24 10:51-2026.01.27 10:51）
  // 只匹配明显是截止时间的格式（后跟"过期"、"可用"等关键词）

  // 先检查是否包含AM/PM格式（下午/上午）
  let isPM = false
  let isAM = false
  if (text.includes('下午') || text.includes('晚')) {
    isPM = true
  } else if (text.includes('上午') || text.includes('早')) {
    isAM = true
  }

  // 时间格式正则表达式
  const timePatterns = [
    // 完整格式：23点30分、23时30分
    /(\d{1,2})点(\d{1,2})分/,
    /(\d{1,2})时(\d{1,2})分/,
    // 简短格式：23点、23时
    /(\d{1,2})点/,
    /(\d{1,2})时/,
    // 冒号格式：23:30
    /(\d{1,2}):(\d{2})(?![\d])/,  // 后面不能跟数字（排除日期范围中的时间）
  ]

  for (const pattern of timePatterns) {
    const match = text.match(pattern)
    if (match) {
      const hour = parseInt(match[1])
      let minute = match[2] ? parseInt(match[2]) : 0

      // 验证这是一个合理的时间
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        // 检查这个时间后面是不是日期分隔符（如 -、到），如果是则跳过
        const timeIndex = text.indexOf(match[0])
        const nextChars = text.substring(timeIndex + match[0].length, timeIndex + match[0].length + 2)
        if (nextChars.match(/^[-–到至]/)) {
          continue
        }

        // 处理AM/PM格式
        let finalHour = hour
        if (isPM && hour < 12) {
          finalHour = hour + 12  // 下午3点 = 15点
        } else if (isAM && hour === 12) {
          finalHour = 0  // 上午12点 = 0点
        }

        result.endHour = finalHour
        result.endMinute = minute
        break
      }
    }
  }

  // 默认23点59分
  if (!result.endHour) {
    result.endHour = 23
    result.endMinute = 59
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
          // 提取第一个空格前的词作为标题
          const firstSpaceIndex = line.indexOf(' ')
          let title = ''
          if (firstSpaceIndex > 0) {
            title = line.substring(0, firstSpaceIndex).trim()
          } else {
            title = line.trim()
          }
          // 保留完整标题，包含"优惠券"、"券"等后缀
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

  return {
    ...result,
    aiModel: 'rule',
    rawResponse: '规则匹配'
  }
}

/**
 * 使用豆包AI提取优惠券信息
 */
async function extractCouponInfoWithDoubao(text: string): Promise<ExtractedCouponInfo> {
  const config = new Config()
  const client = new LLMClient(config)

  const systemPrompt = `你是一个优惠券信息抽取程序。
你不进行对话，不解释，不推理，只输出结构化 JSON。

任务：
从输入文本中提取优惠券信息。
如果有多行文本，每一行视为一张独立优惠券，严禁合并。

【输出总规则】
- 只允许输出 JSON
- 输出必须是一个数组
- JSON 之外不得输出任何字符
- 文本中没有明确出现的信息必须为 null
- 严禁猜测、补全或自动生成内容

【拆分规则】
- 每一行 = 一张优惠券
- 不同平台 / 商家必须拆分为不同对象

【字段结构（每个对象必须完整包含）】
{
  "title": string | null,
  "description": string | null,
  "discountType": "amount" | "full" | "discount" | null,
  "discountAmount": number | null,
  "fullAmount": number | null,
  "startDate": string | null,
  "endDate": string | null,
  "endHour": number | null,
  "notes": string | null,
  "storeName": string | null,
  "isUsed": false
}

【title 规则（豆包重要）】
- 仅当文本中不包含任何时间相关词时，才允许填写 title
- 时间相关词包括：
  有效期、到期、截止、今天、明天、后天、日期、点、号
- title 只能来自原文，不允许改写或组合
- 出现时间相关词 → title 必须为 null

【字段填充规则】

- description：
  - 原样填写整行文本

- discountType：
  - "满X减Y" → "full"
  - "无门槛 / 立减 / 直减 / 减Y元" → "amount"
  - "X折 / 折扣" → "discount"
  - 无法判断 → null

- discountAmount：
  - 满减 / 直减中的"减免金额"
  - 折扣券 → null

- fullAmount：
  - 满减中的"满X金额"
  - 非满减 → null

- startDate：
  - 文本中明确出现才填写
  - 否则 null

- endDate：
  - 到期或有效期描述
  - 相对时间（如 明天 / 后天12点）原样输出

- endHour：
  - 仅当文本中明确出现小时信息时填写
  - 否则 null

- storeName：
  - 平台或商家名称（淘宝、京东、拼多多、PDD、美团、瑞幸等）
  - 未明确 → null

- notes：
  - 补充说明
  - 无 → null

- isUsed：
  - 固定为 false`

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
      if (parsedData.endMinute) result.endMinute = Number(parsedData.endMinute)

      // 验证折扣类型（支持"discount"映射为"percentage"）
      if (parsedData.discountType) {
        if (parsedData.discountType === 'discount') {
          result.discountType = 'percentage'
        } else if (['amount', 'full', 'percentage'].includes(parsedData.discountType)) {
          result.discountType = parsedData.discountType as 'amount' | 'full' | 'percentage'
        }
      }

      // 验证提取结果是否完整
      // 对于满减券，必须有discountType和fullAmount
      // 对于减免券，必须有discountType和discountAmount
      // 对于折扣券，只要有discountType即可
      const isFull = result.discountType === 'full'
      const isAmount = result.discountType === 'amount'
      const isPercentage = result.discountType === 'percentage'

      const isComplete = result.discountType &&
        ((isFull && result.fullAmount) ||  // 满减券：必须有满减金额
         (isAmount && result.discountAmount) ||  // 减免券：必须有减免金额
         isPercentage)  // 折扣券：只要有类型即可

      if (!isComplete) {
        return {
          ...extractCouponInfo(text),
          aiModel: 'rule',
          rawResponse: JSON.stringify(parsedData)
        }
      }

      return {
        ...result,
        aiModel: 'doubao',
        rawResponse: response.content
      }
    } else {
      console.log('豆包返回格式错误，回退到规则匹配')
      return {
        ...extractCouponInfo(text),
        aiModel: 'rule',
        rawResponse: response.content
      }
    }
  } catch (error) {
    console.error('豆包解析失败，回退到规则匹配:', error)
    return {
      ...extractCouponInfo(text),
      aiModel: 'rule',
      rawResponse: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 使用豆包AI批量提取优惠券信息（智能拆分）
 */
async function extractCouponsWithDoubaoBatch(text: string): Promise<ExtractedCouponInfo[]> {
  const config = new Config()
  const client = new LLMClient(config)

  const systemPrompt = `你是一个优惠券信息抽取程序。
你不进行对话，不解释，不推理，只输出结构化 JSON。

任务：
从输入文本中提取优惠券信息。
如果有多行文本，每一行视为一张独立优惠券，严禁合并。

【输出总规则】
- 只允许输出 JSON
- 输出必须是一个数组
- JSON 之外不得输出任何字符
- 文本中没有明确出现的信息必须为 null
- 严禁猜测、补全或自动生成内容

【拆分规则】
- 每一行 = 一张优惠券
- 不同平台 / 商家必须拆分为不同对象

【字段结构（每个对象必须完整包含）】
{
  "title": string | null,
  "description": string | null,
  "discountType": "amount" | "full" | "discount" | null,
  "discountAmount": number | null,
  "fullAmount": number | null,
  "startDate": string | null,
  "endDate": string | null,
  "endHour": number | null,
  "notes": string | null,
  "storeName": string | null,
  "isUsed": false
}

【title 规则（豆包重要）】
- 仅当文本中不包含任何时间相关词时，才允许填写 title
- 时间相关词包括：
  有效期、到期、截止、今天、明天、后天、日期、点、号
- title 只能来自原文，不允许改写或组合
- 出现时间相关词 → title 必须为 null

【字段填充规则】

- description：
  - 原样填写整行文本

- discountType：
  - "满X减Y" → "full"
  - "无门槛 / 立减 / 直减 / 减Y元" → "amount"
  - "X折 / 折扣" → "discount"
  - 无法判断 → null

- discountAmount：
  - 满减 / 直减中的"减免金额"
  - 折扣券 → null

- fullAmount：
  - 满减中的"满X金额"
  - 非满减 → null

- startDate：
  - 文本中明确出现才填写
  - 否则 null

- endDate：
  - 到期或有效期描述
  - 相对时间（如 明天 / 后天12点）原样输出

- endHour：
  - 仅当文本中明确出现小时信息时填写
  - 否则 null

- storeName：
  - 平台或商家名称（淘宝、京东、拼多多、PDD、美团、瑞幸等）
  - 未明确 → null

- notes：
  - 补充说明
  - 无 → null

- isUsed：
  - 固定为 false`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: text },
  ]

  try {
    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0, // 零温度确保输出稳定
    })

    console.log('【豆包批量识别】豆包返回的原始数据:')
    console.log(response.content)

    // 提取JSON数组
    let jsonStr = response.content.trim()

    // 策略1：提取最后一个JSON数组
    const jsonArrayMatch = response.content.match(/\[[\s\S]*\]/)
    if (jsonArrayMatch) {
      jsonStr = jsonArrayMatch[0]
      console.log('【豆包批量识别】提取的JSON数组:')
      console.log(jsonStr)
    } else {
      console.log('【豆包批量识别】未找到JSON数组，使用原始内容')
      console.log(jsonStr)
    }

    const parsedData = JSON.parse(jsonStr)

    console.log('【豆包批量识别】解析后的数据:')
    console.log(JSON.stringify(parsedData, null, 2))

    // 验证是否为数组
    if (!Array.isArray(parsedData)) {
      console.log('【豆包批量识别】豆包返回的不是数组，回退到按行识别')
      console.log('【豆包批量识别】数据类型:', typeof parsedData)
      console.log('【豆包批量识别】数据:', JSON.stringify(parsedData))
      return text.split('\n').map(line => extractCouponInfo(line.trim()))
    }

    console.log(`【豆包批量识别】解析成功，共 ${parsedData.length} 张优惠券`)

    // 转换为系统内部格式
    const results: ExtractedCouponInfo[] = []
    for (const item of parsedData) {
      const result: ExtractedCouponInfo = {
        aiModel: 'doubao',
        rawResponse: JSON.stringify(item),
      }

      // 直接映射字段
      if (item.title) result.title = item.title
      if (item.description) result.description = item.description
      if (item.notes) result.notes = item.notes
      if (item.storeName) result.storeName = item.storeName
      if (item.startDate) result.startDate = item.startDate
      if (item.endDate) result.endDate = item.endDate

      // 映射折扣类型
      if (item.discountType) {
        if (item.discountType === 'discount') {
          result.discountType = 'percentage'
        } else if (['amount', 'full'].includes(item.discountType)) {
          result.discountType = item.discountType as 'amount' | 'full'
        }
      }

      if (item.discountAmount !== undefined && item.discountAmount !== null) {
        result.discountAmount = Number(item.discountAmount)
      }
      if (item.fullAmount !== undefined && item.fullAmount !== null) {
        result.fullAmount = Number(item.fullAmount)
      }
      if (item.endHour !== undefined && item.endHour !== null) {
        result.endHour = Number(item.endHour)
      }

      results.push(result)
    }

    console.log('【豆包批量识别】转换后的结果:')
    console.log(JSON.stringify(results, null, 2))

    return results

  } catch (error) {
    console.error('【豆包批量识别】豆包批量抽取失败，回退到按行识别:', error)
    console.error('【豆包批量识别】错误详情:', error instanceof Error ? error.message : '未知错误')
    if (error instanceof Error && error.stack) {
      console.error('【豆包批量识别】堆栈:', error.stack)
    }
    return text.split('\n').map(line => extractCouponInfo(line.trim()))
  }
}

/**
 * 使用ChatGPT提取优惠券信息
 */
async function extractCouponInfoWithChatGPT(text: string, apiKey?: string): Promise<ExtractedCouponInfo> {
  const { default: OpenAI } = await import('openai')

  // API Key 优先级：参数 > 环境变量
  const finalApiKey = apiKey || process.env.CHATGPT_API_KEY

  if (!finalApiKey) {
    console.error('ChatGPT API Key 未配置')
    return extractCouponInfo(text)
  }

  const openai = new OpenAI({
    apiKey: finalApiKey,
    baseURL: 'https://free.v36.cm/v1/',
  })

  const systemPrompt = `你是一个【优惠券信息结构化解析程序】，
只负责从原始文本中抽取字段并输出 JSON，
禁止解释、禁止总结、禁止对话、禁止补全。

【输出格式】
- 仅输出 JSON 对象
- 不要使用 JSON 数组格式

【字段定义】

- title: string | null - 优惠券标题
- description: string | null - 描述信息
- discountType: "amount" | "percentage" | "full" | null - 折扣类型（满减/full，折扣/percentage，减免/amount）
- discountAmount: number | null - 优惠金额（满减中的减金额、减免金额）
- fullAmount: number | null - 满减中的满金额
- startDate: string | null - 开始日期，格式YYYY-MM-DD
- endDate: string | null - 到期日期，格式YYYY-MM-DD
- endHour: number | null - 截止小时，0-23
- endMinute: number | null - 截止分钟，0-59
- storeName: string | null - 商家或平台名称
- notes: string | null - 备注信息

【解析规则】

1. 提取商家名称（淘宝、京东、拼多多、美团、瑞幸等）
2. 识别优惠类型：
   - "满X减Y" → discountType=full, fullAmount=X, discountAmount=Y
   - "X折" → discountType=percentage, discountAmount=X
   - "立减X"、"X元无门槛" → discountType=amount, discountAmount=X
3. 提取时间信息：
   - 日期格式：2024-12-31、2024年12月31日 → 转换为YYYY-MM-DD
   - 时间格式：23点、23点30分 → 提取endHour和endMinute
   - 相对时间（今天、明天等）保持原样
4. 如果某些字段无法提取，返回null

【示例】

输入: "瑞幸咖啡 20元立减金 2026年2月25日到期"
输出: {"title":"瑞幸咖啡 20元立减金","discountType":"amount","discountAmount":20,"endDate":"2026-02-25","storeName":"瑞幸咖啡"}

输入: "建设银行 满2000减5 2026年2月23日23:59失效"
输出: {"title":"建设银行立减金","discountType":"full","fullAmount":2000,"discountAmount":5,"endDate":"2026-02-23","endHour":23,"endMinute":59,"storeName":"建设银行"}`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: text },
  ]

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0,
    })

    console.log('【ChatGPT单张识别】原始数据:', JSON.stringify(response, null, 2))

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error('【ChatGPT单张识别】返回内容为空')
      return extractCouponInfo(text)
    }

    // 提取JSON内容
    let jsonStr = content.trim()
    
    // 尝试提取JSON对象
    const jsonObjectMatch = content.match(/\{[\s\S]*\}/)
    if (jsonObjectMatch) {
      jsonStr = jsonObjectMatch[0]
    }

    console.log('【ChatGPT单张识别】提取的JSON:', jsonStr)

    let parsedData
    try {
      parsedData = JSON.parse(jsonStr)
    } catch (jsonError) {
      console.error('【ChatGPT单张识别】JSON解析失败:', jsonError)
      return {
        ...extractCouponInfo(text),
        aiModel: 'rule',
        rawResponse: content
      }
    }

    // 直接映射到结果
    const result: ExtractedCouponInfo = {
      title: parsedData.title,
      description: parsedData.description,
      discountType: parsedData.discountType,
      discountAmount: parsedData.discountAmount,
      fullAmount: parsedData.fullAmount,
      startDate: parsedData.startDate,
      endDate: parsedData.endDate,
      endHour: parsedData.endHour,
      endMinute: parsedData.endMinute,
      storeName: parsedData.storeName,
      notes: parsedData.notes,
      aiModel: 'chatgpt',
      rawResponse: content
    }

    console.log('【ChatGPT单张识别】解析结果:', result)

    // 如果AI没有提取到完整信息，回退到规则匹配
    if (!result.discountAmount || !result.discountType) {
      console.log('【ChatGPT单张识别】提取不完整，回退到规则匹配')
      return {
        ...extractCouponInfo(text),
        aiModel: 'rule',
        rawResponse: content
      }
    }

    return result

  } catch (error) {
    console.error('【ChatGPT单张识别】调用失败:', error)
    return {
      ...extractCouponInfo(text),
      aiModel: 'rule',
      rawResponse: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 使用ChatGPT批量提取优惠券信息（智能拆分）
 */
async function extractCouponsWithChatGPTBatch(text: string, apiKey?: string): Promise<ExtractedCouponInfo[]> {
  const { default: OpenAI } = await import('openai')

  // API Key 优先级：参数 > 环境变量
  const finalApiKey = apiKey || process.env.CHATGPT_API_KEY

  if (!finalApiKey) {
    console.error('ChatGPT API Key 未配置，回退到按行识别')
    return text.split('\n').map(line => extractCouponInfo(line.trim()))
  }

  const openai = new OpenAI({
    apiKey: finalApiKey,
    baseURL: 'https://free.v36.cm/v1/',
  })

  const systemPrompt = `你是一个【优惠券信息结构化解析程序】，
只负责从原始文本中抽取字段并输出 JSON，
禁止解释、禁止总结、禁止对话、禁止补全。

【输出格式】
- 仅输出 JSON 数组
- 顶层必须是数组
- 每个数组元素对应 1 张优惠券
- 即使只识别出 1 张，也必须使用数组

【字段定义】

- title: string | null - 优惠券标题
- description: string | null - 描述信息
- discountType: "amount" | "percentage" | "full" | null - 折扣类型（满减/full，折扣/percentage，减免/amount）
- discountAmount: number | null - 优惠金额（满减中的减金额、减免金额）
- fullAmount: number | null - 满减中的满金额
- startDate: string | null - 开始日期，格式YYYY-MM-DD
- endDate: string | null - 到期日期，格式YYYY-MM-DD
- endHour: number | null - 截止小时，0-23
- endMinute: number | null - 截止分钟，0-59
- storeName: string | null - 商家或平台名称
- notes: string | null - 备注信息

【解析规则】

1. 按行拆分文本，每行识别为一张优惠券
2. 提取商家名称（淘宝、京东、拼多多、美团、瑞幸等）
3. 识别优惠类型：
   - "满X减Y" → discountType=full, fullAmount=X, discountAmount=Y
   - "X折" → discountType=percentage, discountAmount=X
   - "立减X"、"X元无门槛" → discountType=amount, discountAmount=X
4. 提取时间信息：
   - 日期格式：2024-12-31、2024年12月31日 → 转换为YYYY-MM-DD
   - 时间格式：23点、23点30分 → 提取endHour和endMinute
   - 相对时间（今天、明天等）保持原样
5. 如果某些字段无法提取，返回null

【示例】

输入: "瑞幸咖啡 20元立减金 2026年2月25日到期"
输出: [{"title":"瑞幸咖啡 20元立减金","discountType":"amount","discountAmount":20,"endDate":"2026-02-25","storeName":"瑞幸咖啡"}]`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: text },
  ]

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0,
    })

    console.log('【ChatGPT批量识别】原始数据:', JSON.stringify(response, null, 2))

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error('【ChatGPT批量识别】返回内容为空')
      return text.split('\n').map(line => extractCouponInfo(line.trim()))
    }

    // 提取JSON数组
    let jsonStr = content.trim()
    const jsonArrayMatch = content.match(/\[[\s\S]*\]/)
    if (jsonArrayMatch) {
      jsonStr = jsonArrayMatch[0]
    }

    console.log('【ChatGPT批量识别】提取的JSON:', jsonStr)

    let parsedArray
    try {
      parsedArray = JSON.parse(jsonStr)
      if (!Array.isArray(parsedArray)) {
        console.error('【ChatGPT批量识别】返回的不是数组')
        return text.split('\n').map(line => extractCouponInfo(line.trim()))
      }
    } catch (jsonError) {
      console.error('【ChatGPT批量识别】JSON解析失败:', jsonError)
      return text.split('\n').map(line => extractCouponInfo(line.trim()))
    }

    // 转换为系统格式
    const results: ExtractedCouponInfo[] = parsedArray.map((item: any) => ({
      title: item.title,
      description: item.description,
      discountType: item.discountType,
      discountAmount: item.discountAmount,
      fullAmount: item.fullAmount,
      startDate: item.startDate,
      endDate: item.endDate,
      endHour: item.endHour,
      endMinute: item.endMinute,
      storeName: item.storeName,
      notes: item.notes,
      aiModel: 'chatgpt' as const,
      rawResponse: JSON.stringify(item),
    }))

    console.log('【ChatGPT批量识别】解析结果:', results)

    return results

  } catch (error) {
    console.error('【ChatGPT批量识别】调用失败:', error)
    return text.split('\n').map(line => extractCouponInfo(line.trim()))
  }
}

/**
 * 使用AI提取优惠券信息
 */
async function extractCouponInfoWithAI(text: string, aiModel?: 'doubao' | 'glm', glmApiKey?: string, useFallback = true): Promise<ExtractedCouponInfo> {
  let result: ExtractedCouponInfo

  try {
    // 1. 优先使用指定的AI模型
    if (aiModel === 'glm') {
      result = await extractCouponInfoWithChatGPT(text, glmApiKey)
      // ChatGPT可能有相对日期，需要验证
      const isComplete = result.discountType && result.endDate
      if (isComplete || !useFallback) {
        return result
      }
    } else if (aiModel === 'doubao') {
      result = await extractCouponInfoWithDoubao(text)
      // 豆包内部已经有完善的验证逻辑，直接返回结果
      return result
    } else {
      // 未指定模型，默认使用豆包AI
      result = await extractCouponInfoWithDoubao(text)
      // 豆包内部已经有完善的验证逻辑，直接返回结果
      return result
    }

    console.log('AI提取不完整，尝试回退到下一个模型')
  } catch (error) {
    console.error('AI模型调用失败:', error)
  }

  // 2. 回退到豆包
  if (aiModel !== 'doubao' && useFallback) {
    try {
      result = await extractCouponInfoWithDoubao(text)
      // 豆包内部已经有完善的验证逻辑，直接返回结果
      console.log('豆包提取成功')
      return result
    } catch (error) {
      console.error('豆包模型调用失败:', error)
    }
  }

  // 3. 最终回退到规则匹配
  console.log('回退到规则匹配')
  return extractCouponInfo(text)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, useAI, aiModel, chatgptApiKey: requestChatgptApiKey, useFallback = true, smartBatch = false } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: '请提供文本内容' },
        { status: 400 }
      )
    }

    // 智能批量抽取模式
    if (smartBatch) {
      try {
        let results: ExtractedCouponInfo[]

        if (aiModel === 'glm') {
          // ChatGPT批量抽取
          // 尝试从多个来源获取API Key
          let finalChatgptApiKey = requestChatgptApiKey
          if (!finalChatgptApiKey) {
            const { getWebDAVConfigFromRequest } = await import('@/lib/config')
            const webdavConfig = getWebDAVConfigFromRequest(request)
            if (webdavConfig?.chatgptApiKey) {
              finalChatgptApiKey = webdavConfig.chatgptApiKey
            }
            if (!finalChatgptApiKey && process.env.CHATGPT_API_KEY) {
              finalChatgptApiKey = process.env.CHATGPT_API_KEY
            }
          }

          results = await extractCouponsWithChatGPTBatch(text, finalChatgptApiKey)
        } else {
          // 豆包批量抽取（默认）
          results = await extractCouponsWithDoubaoBatch(text)
        }

        return NextResponse.json({
          success: true,
          data: results,
        })
      } catch (error) {
        console.error('智能批量抽取失败，回退到按行识别:', error)
        // 回退到按行识别
      }
    }

    // 普通模式（单张优惠券识别）
    let extractedInfo: ExtractedCouponInfo
    if (useAI === true) {
      const model = aiModel || 'doubao' // 默认使用豆包AI
      extractedInfo = await extractCouponInfoWithAI(text, model, requestChatgptApiKey, useFallback)
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
