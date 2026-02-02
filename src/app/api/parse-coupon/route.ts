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
  aiModel?: 'glm' | 'doubao' | 'rule' // 使用的AI模型
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

  const systemPrompt = `你是一个专业的优惠券信息提取助手。请从给定的文本中提取优惠券的关键信息，并以JSON格式返回。

支持的输入格式示例：
1. "华香脆骨串优惠券 有效期至2026-01-31 23:59"
2. "淘宝优惠券满100减20元有效期至2024-12-31 23点30分"
3. "建设银行立减金，满2000减5元，有效期至2024-12-31 23时59分，饮品通用"
4. "蜜雪冰城饮品优惠券 8折 有效期至2026-01-30"
5. "华莱士串 1.30过期" （1月30日过期）
6. "华莱士串 这个月30过期" （本月30日过期）
7. "华莱士串 3天后过期" （3天后过期）
8. "华莱士串 29天后到期" （29天后到期）
9. "华莱士串 下个月5号过期" （下个月5号过期）
10. "蜜雪冰城 本月15号失效" （本月15号失效）
11. "茶百道 7天后作废" （7天后作废）
12. "古茗 今天到期" （今天到期）
13. "蜜雪冰城 明天失效" （明天失效）
14. "茶百道 本周日作废" （本周日作废）
15. "蜜雪冰城 下周一下午3点15分失效" （下周一下午失效，15点15分）
16. "茶百道 本月底过期" （本月最后一天）
17. "蜜雪冰城 下月底作废" （下月最后一天）
18. "茶百道 下个季度初失效" （下个季度第一天）
19. "蜜雪冰城优惠券 2026-03-15之前使用" （2026-03-14，不包含当日）

提取规则：
1. title: 优惠券标题（优先提取店铺/商品名+优惠券类型，如"华香脆骨串优惠券"、"建设银行立减金"、"华莱士串"）
2. discountAmount: 折扣金额或折扣数值（如减5元则为5，8折则为8）
3. discountType: 折扣类型（amount=减免金额, percentage=折扣, full=满减）
4. fullAmount: 满减金额（仅当discountType为full时需要）
5. endDate: 截止日期，格式为YYYY-MM-DD（如2026-01-31）
6. endHour: 截止小时，0-23之间的整数，默认为23
7. endMinute: 截止分钟，0-59之间的整数，默认为59
8. storeName: 店铺或平台名称（从开头提取，如"华香脆骨串"、"淘宝"、"建设银行"、"蜜雪冰城"、"华莱士"）
9. description: 描述信息（如"饮品"、"脆骨串"、"串"等）

注意事项：
- 日期格式必须为YYYY-MM-DD
- 时间格式：
  * 默认时间：23:59（23点59分）
  * 完整格式：23:59、23点59分、23时59分
  * 简短格式：23点、23时
  * AM/PM格式：下午3点15分=15:15、上午10点30分=10:30、下午3点=15:00
  * 如果只提到"下午3点"，分钟默认为0
  * 如果只提到"23点"，分钟默认为0
- 支持的日期格式：
  * 标准格式：2026-01-31、2026年1月31日、1月31日
  * 带时间的日期：23:59、23点、23时
  * 月份.日期格式：1.30过期、2.5到期、3.15失效、4.20作废
  * 相对日期格式：这个月30过期、3天后到期、29天后失效、7天后作废
  * 有效期格式：有效期至2026-01-31、有效期2026-01-31
  * 今天明天格式：今天到期、明天失效（支持"下午/上午/晚上"）
  * 本周下周格式：本周日作废、下周一下午3点失效
  * 月底格式：本月底过期、下月底作废
  * 季度格式：下个季度初失效
  * 之前使用格式：2026-03-15之前使用（不包含当日，日期减1天）
- 支持的关键词：过期、到期、失效、作废、有效期至、之前使用
- 相对日期处理规则：
  * "这个月30过期" = 当前年份+当前月份+30日
  * "3天后过期" = 当前日期+3天
  * "3天后到期" = 当前日期+3天
  * "29天后失效" = 当前日期+29天
  * "3天后作废" = 当前日期+3天
  * "下个月5号过期" = 当前年份+下个月+5日
  * "今天到期" = 当前日期
  * "明天失效" = 当前日期+1天
  * "本周日作废" = 本周日（如果已过，则为下周日）
  * "下周一下午3点失效" = 下周一+15点
  * "本月底过期" = 本月最后一天
  * "下月底作废" = 下月最后一天
  * "下个季度初失效" = 下个季度第一天（如Q1开始=1月1日）
  * "2026-03-15之前使用" = 2026-03-14（不包含当日，减1天）
  * "有效期至2026-01-31" = 2026-01-31
- 支持的关键词：过期、到期、失效、作废、有效期至
- 如果文本中没有明确截止时间，endHour默认设为23，endMinute默认设为59
- 折扣类型判断：
  * 如果包含"满X可用"、"满X减X"、"满X-Y"，则为full
  * 如果包含"X折"但不包含"满"，则为percentage
  * 如果包含"减X元"、"减免X元"，则为amount
  * 如果只提到"优惠券"但没有折扣信息，设为null
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
  "endMinute": 59,
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
      if (parsedData.endMinute) result.endMinute = Number(parsedData.endMinute)

      // 验证折扣类型
      if (parsedData.discountType && ['amount', 'percentage', 'full'].includes(parsedData.discountType)) {
        result.discountType = parsedData.discountType
      }

      // 如果AI没有提取到完整信息，回退到规则匹配
      if (!result.title || !result.discountAmount || !result.discountType) {
        console.log('豆包提取不完整，回退到规则匹配')
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
 * 使用GLM-4.7-Flash提取优惠券信息
 */
async function extractCouponInfoWithGLM(text: string, apiKey?: string): Promise<ExtractedCouponInfo> {
  const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

  // API Key 优先级：参数 > 环境变量
  const finalApiKey = apiKey || process.env.GLM_API_KEY

  if (!finalApiKey) {
    console.error('GLM API Key 未配置')
    return extractCouponInfo(text)
  }

  const messages = [
    {
      role: 'system',
      content: `你是一个优惠券信息抽取程序，不进行任何对话，也不进行解释或推理。

你的唯一任务是：
从用户提供的文本中，提取优惠券信息，并输出一个 JSON 对象。

【输出格式要求（必须严格遵守）】
1. 只允许输出一个 JSON 对象
2. JSON 之外不得输出任何字符（包括解释、推理、注释、空行）
3. 所有字段必须存在，未识别的信息必须为 null
4. 不允许猜测、补全或推断文本中未明确给出的信息
5. 字段值类型必须严格匹配说明

【时间字段特别规则（非常重要）】
- 出现"今天 / 明天 / 后天 / 今天24点前 / 明日 / 次日"等相对时间描述时：
  - 必须原样输出到 validFrom / validTo
  - 严禁换算为具体日期
  - 严禁推断当前时间

【JSON 字段定义】
{
  "title": string | null,
  "type": "满减" | "折扣" | "直减" | "其他",
  "threshold": number | null,
  "amountOff": number | null,
  "discountRate": number | null,
  "validFrom": string | null,
  "validTo": string | null,
  "platform": string | null,
  "notes": string | null
}

【类型判定规则】
- 出现"满X减Y" → type = "满减"
- 出现"直减 / 减Y元 / 立减Y元" → type = "直减"
- 出现"X折 / 折扣" → type = "折扣"
- 无法明确归类 → type = "其他"

【重要约束】
- 不得输出 Markdown
- 不得输出示例
- 不得输出说明文字
- 不得输出推理过程`
    },
    {
      role: 'user',
      content: text
    }
  ]

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${finalApiKey}`
      },
      body: JSON.stringify({
        model: 'glm-4.7-flash',
        messages,
        temperature: 0,
        max_tokens: 1024
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('GLM API Error:', JSON.stringify(data, null, 2))
      return extractCouponInfo(text)
    }

    console.log('GLM API 响应:', JSON.stringify(data, null, 2))

    // GLM-4.7-Flash 可能会返回 reasoning_content 而不是 content
    const content = data.choices[0]?.message?.content || data.choices[0]?.message?.reasoning_content
    if (!content) {
      console.error('GLM API 返回内容为空, 响应数据:', JSON.stringify(data, null, 2))
      return extractCouponInfo(text)
    }

    // 提取JSON内容
    // GLM-4.7-Flash 可能返回大量推理过程，需要提取最后的JSON代码块
    let jsonStr = content.trim()

    console.log('原始内容前300字符:', content.substring(0, 300))
    console.log('原始内容总长度:', content.length)

    // 策略1：尝试提取最后一个以```json开头、以```结尾的代码块
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/g)
    if (jsonBlockMatch && jsonBlockMatch.length > 0) {
      // 使用最后一个匹配的代码块
      const lastMatch = jsonBlockMatch[jsonBlockMatch.length - 1]
      jsonStr = lastMatch.replace(/```json\s*/, '').replace(/```$/, '').trim()
      console.log('策略1：找到JSON代码块')
    } else {
      // 策略2：尝试提取最后一个以```开头、以```结尾的代码块
      const codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/g)
      if (codeBlockMatch && codeBlockMatch.length > 0) {
        // 使用最后一个匹配的代码块
        const lastMatch = codeBlockMatch[codeBlockMatch.length - 1]
        jsonStr = lastMatch.replace(/```\s*/, '').replace(/```$/, '').trim()
        console.log('策略2：找到普通代码块')
      } else {
        // 策略3：尝试直接从内容中提取JSON对象（以{开头，以}结尾）
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/g)
        if (jsonObjectMatch && jsonObjectMatch.length > 0) {
          // 使用最后一个匹配的JSON对象
          const lastMatch = jsonObjectMatch[jsonObjectMatch.length - 1]
          jsonStr = lastMatch.trim()
          console.log('策略3：找到JSON对象')
        } else {
          console.log('策略4：使用完整内容')
          jsonStr = content.trim()
        }
      }
    }

    console.log('提取的JSON字符串前200字符:', jsonStr.substring(0, 200))
    console.log('提取的JSON字符串完整长度:', jsonStr.length)

    // 尝试解析JSON，如果失败则记录详细错误
    let parsedData
    try {
      parsedData = JSON.parse(jsonStr)
    } catch (jsonError) {
      console.error('JSON解析失败，原始内容前500字符:', content.substring(0, 500))
      console.error('JSON解析失败，提取的字符串:', jsonStr)
      console.error('JSON解析错误:', jsonError instanceof Error ? jsonError.message : jsonError)

      // 尝试修复常见的JSON错误
      // 例如：删除末尾的逗号
      const fixedJson = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
      try {
        parsedData = JSON.parse(fixedJson)
        console.log('JSON修复后解析成功')
      } catch (fixedError) {
        console.error('JSON修复后仍然失败')
        throw jsonError
      }
    }

    // 验证和转换数据（字段映射）
    const result: ExtractedCouponInfo = {}

    // 标题映射
    if (parsedData.title) result.title = parsedData.title

    // 类型转换
    if (parsedData.type) {
      const typeMap: Record<string, 'amount' | 'percentage' | 'full'> = {
        '满减': 'full',
        '折扣': 'percentage',
        '直减': 'amount',
        '其他': 'amount'
      }
      result.discountType = typeMap[parsedData.type] || 'amount'
    }

    // 金额映射
    if (parsedData.threshold) result.fullAmount = Number(parsedData.threshold)
    if (parsedData.amountOff) result.discountAmount = Number(parsedData.amountOff)
    if (parsedData.discountRate) result.discountAmount = Number(parsedData.discountRate)

    // 日期映射
    if (parsedData.validTo) {
      const validTo = parsedData.validTo
      // 检查是否是相对日期（包含"今天/明天/后天/本周/下周/本月/下月/X天后"等）
      const isRelativeDate = /(?:今天|明天|后天|本周|下周|本月|下月|\d+天后|星期|周[一二三四五六日])/i.test(validTo)

      if (isRelativeDate) {
        console.log('GLM识别到相对日期:', validTo, '，调用规则匹配进行转换')
        // 使用规则匹配来转换相对日期
        const ruleResult = extractCouponInfo(text)
        if (ruleResult.endDate) {
          result.endDate = ruleResult.endDate
          if (ruleResult.endHour) result.endHour = ruleResult.endHour
          if (ruleResult.endMinute) result.endMinute = ruleResult.endMinute
          console.log('规则匹配转换结果:', {
            endDate: result.endDate,
            endHour: result.endHour,
            endMinute: result.endMinute
          })
        } else {
          // 如果规则匹配也无法转换，保持原值
          result.endDate = validTo
          console.log('规则匹配无法转换，保持原值:', validTo)
        }
      } else {
        // 检查是否是混合格式（日期+中文时间），如"2024-12-31 23点"、"2024-12-31 23点30分"
        const dateTimePattern = /^(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})\s*(?:日号)?\s*(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分)?$/
        const dateTimeMatch = validTo.match(dateTimePattern)

        if (dateTimeMatch) {
          // 提取日期和时间
          const datePart = dateTimeMatch[1]
          const hour = parseInt(dateTimeMatch[2])
          const minute = dateTimeMatch[3] ? parseInt(dateTimeMatch[3]) : 0

          // 转换日期格式（统一为YYYY-MM-DD）
          const formattedDate = datePart
            .replace(/\//g, '-')
            .replace(/年/g, '-')
            .replace(/月/g, '-')
            .replace(/日/g, '')

          result.endDate = formattedDate
          if (hour >= 0 && hour <= 23) {
            result.endHour = hour
            if (minute >= 0 && minute <= 59) {
              result.endMinute = minute
            }
          }
          console.log('解析混合格式日期时间:', {
            original: validTo,
            date: formattedDate,
            time: `${hour}:${minute}`
          })
        } else {
          // 纯日期格式，直接使用
          // 尝试标准化日期格式
          let standardizedDate = validTo
            .replace(/\//g, '-')
            .replace(/年/g, '-')
            .replace(/月/g, '-')
            .replace(/日/g, '')

          // 如果格式不是YYYY-MM-DD，尝试补充
          if (!/^\d{4}-\d{2}-\d{2}$/.test(standardizedDate)) {
            // 可能是"12-31"或"2024.12.31"等格式
            const dateMatch = standardizedDate.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/)
            if (dateMatch) {
              standardizedDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
            }
          }

          result.endDate = standardizedDate
        }
      }
    }

    // 平台和描述
    if (parsedData.platform) result.storeName = parsedData.platform
    if (parsedData.notes) result.description = parsedData.notes

    // 如果AI没有提取到完整信息，回退到规则匹配
    // 只要discountAmount和discountType有值就认为是有效识别
    if (!result.discountAmount || !result.discountType) {
      console.log('GLM提取不完整，回退到规则匹配')
      return {
        ...extractCouponInfo(text),
        aiModel: 'rule',
        rawResponse: JSON.stringify(parsedData)
      }
    }

    // 如果没有title，尝试从原始文本中提取
    if (!result.title && text.trim()) {
      // 提取第一行或前20个字符作为title
      const firstLine = text.split('\n')[0].trim()
      result.title = firstLine.length > 20 ? firstLine.substring(0, 20) : firstLine
    }

    return {
      ...result,
      aiModel: 'glm',
      rawResponse: content
    }

  } catch (error) {
    console.error('GLM解析失败，回退到规则匹配:', error)
    return {
      ...extractCouponInfo(text),
      aiModel: 'rule',
      rawResponse: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 使用GLM-4.7-Flash批量提取优惠券信息（智能拆分）
 */
async function extractCouponsWithGLMBatch(text: string, apiKey?: string): Promise<ExtractedCouponInfo[]> {
  const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

  // API Key 优先级：参数 > 环境变量
  const finalApiKey = apiKey || process.env.GLM_API_KEY

  if (!finalApiKey) {
    console.error('GLM API Key 未配置，回退到按行识别')
    // 回退到按行识别
    return text.split('\n').map(line => extractCouponInfo(line.trim()))
  }

  const messages = [
    {
      role: 'system',
      content: `你是一个优惠券信息批量抽取程序，不进行任何对话、解释或推理。

你的唯一任务是：
从用户提供的文本中，按"每一行一张优惠券"的规则，
抽取优惠券信息，并输出一个 JSON 数组，用于直接写入数据库。

【全局输出规则（必须严格遵守）】
1. 只允许输出一个 JSON 数组
2. JSON 之外不得输出任何字符（包括解释、推理、空行、Markdown）
3. 数组中每一项都是一张独立优惠券
4. 每个对象必须包含全部字段
5. 文本中未明确给出的信息必须为 null
6. 严禁猜测、补全、推断
7. 严禁将多行内容合并为一张优惠券

【优惠券拆分规则（硬性）】
- 输入文本如果包含多行：
  - 默认"每一行 = 一张优惠券"
  - 严禁跨行合并
- 不同平台 / 商家名称必须视为不同优惠券

【时间字段规则（非常重要）】
- 出现"今天 / 明天 / 后天 / 今日 / 明日 / 次日 / 后天12点 / 今天23点"等相对时间描述时：
  - 原样输出为字符串
  - 不得换算为具体日期
- 未明确出现开始时间 → startDate = null

【JSON 字段定义（每个对象必须完整包含）】
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

【title 字段规则（宽松但可控）】
- 如果一行文本中：
  - 在平台名或商家名之后
  - 且不包含任何时间相关词（如 有效期 / 到期 / 截止 / 今天 / 明天 / 后天 / 日期 / 点）
- 则可以将"平台名 + 优惠核心描述"作为 title
- 如果文本中包含任何时间相关描述：
  - title 必须为 null
- 严禁：
  - 自动生成不存在的名称
  - 将时间、日期、小时拼接进 title
  - 仅凭金额或折扣生成 title

【字段填充规则】

- description：
  - 填写原始文本内容（整行）
  - 不允许删减或改写

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
  - 仅当文本中明确给出开始时间时填写
  - 否则 null

- endDate：
  - 到期时间或有效期描述，允许相对时间
  - 原样输出，不做换算

- endHour：
  - 仅当文本中明确出现"X点 / X:00 / 23点 / 23:59"等时填写小时数
  - 未明确 → null

- storeName：
  - 平台或商家名称（如 淘宝 / 京东 / 拼多多 / PDD / 美团 / 瑞幸 / 银行）
  - 无明确名称 → null

- notes：
  - 备注性、补充性说明
  - 无 → null

- isUsed：
  - 永远输出 false`
    },
    {
      role: 'user',
      content: text
    }
  ]

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${finalApiKey}`
      },
      body: JSON.stringify({
        model: 'glm-4.7-flash',
        messages,
        temperature: 0,
        max_tokens: 4096  // 增加token限制，支持批量抽取
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('GLM API Error:', JSON.stringify(data, null, 2))
      // 回退到按行识别
      return text.split('\n').map(line => extractCouponInfo(line.trim()))
    }

    console.log('GLM API 响应:', JSON.stringify(data, null, 2))

    // GLM-4.7-Flash 可能会返回 reasoning_content 而不是 content
    const content = data.choices[0]?.message?.content || data.choices[0]?.message?.reasoning_content
    if (!content) {
      console.error('GLM API 返回内容为空, 响应数据:', JSON.stringify(data, null, 2))
      return text.split('\n').map(line => extractCouponInfo(line.trim()))
    }

    // 提取JSON数组内容
    let jsonStr = content.trim()

    console.log('原始内容前300字符:', content.substring(0, 300))
    console.log('原始内容总长度:', content.length)

    // 策略1：尝试提取最后一个以```json开头、以```结尾的代码块
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/g)
    if (jsonBlockMatch && jsonBlockMatch.length > 0) {
      const lastMatch = jsonBlockMatch[jsonBlockMatch.length - 1]
      jsonStr = lastMatch.replace(/```json\s*/, '').replace(/```$/, '').trim()
      console.log('策略1：找到JSON代码块')
    } else {
      // 策略2：尝试提取最后一个以```开头、以```结尾的代码块
      const codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/g)
      if (codeBlockMatch && codeBlockMatch.length > 0) {
        const lastMatch = codeBlockMatch[codeBlockMatch.length - 1]
        jsonStr = lastMatch.replace(/```\s*/, '').replace(/```$/, '').trim()
        console.log('策略2：找到普通代码块')
      } else {
        // 策略3：尝试直接从内容中提取JSON数组（以[开头，以]结尾）
        const jsonArrayMatch = content.match(/\[[\s\S]*\]/)
        if (jsonArrayMatch) {
          jsonStr = jsonArrayMatch[0].trim()
          console.log('策略3：找到JSON数组')
        } else {
          console.log('策略4：使用完整内容')
          jsonStr = content.trim()
        }
      }
    }

    console.log('提取的JSON字符串前200字符:', jsonStr.substring(0, 200))
    console.log('提取的JSON字符串完整长度:', jsonStr.length)

    // 尝试解析JSON数组
    let parsedArray: any[]
    try {
      parsedArray = JSON.parse(jsonStr)
      if (!Array.isArray(parsedArray)) {
        console.error('解析结果不是数组，回退到按行识别')
        return text.split('\n').map(line => extractCouponInfo(line.trim()))
      }
    } catch (jsonError) {
      console.error('JSON解析失败，原始内容前500字符:', content.substring(0, 500))
      console.error('JSON解析失败，提取的字符串:', jsonStr)
      console.error('JSON解析错误:', jsonError instanceof Error ? jsonError.message : jsonError)
      // 回退到按行识别
      return text.split('\n').map(line => extractCouponInfo(line.trim()))
    }

    // 转换每个优惠券对象为内部格式
    const results: ExtractedCouponInfo[] = []

    // 先按行分割文本，用于后续规则匹配
    const textLines = text.split('\n').map(line => line.trim()).filter(line => line)

    for (let i = 0; i < parsedArray.length; i++) {
      const item = parsedArray[i]
      const result: ExtractedCouponInfo = {}

      // 直接映射字段（新格式已经是数据库格式）
      if (item.title) result.title = item.title
      if (item.description) result.description = item.description
      
      // 类型映射：discount → percentage（统一使用percentage表示折扣）
      if (item.discountType) {
        if (item.discountType === 'discount') {
          result.discountType = 'percentage'
        } else if (item.discountType === 'amount' || item.discountType === 'full') {
          result.discountType = item.discountType
        }
      }
      
      if (item.discountAmount) result.discountAmount = Number(item.discountAmount)
      if (item.fullAmount) result.fullAmount = Number(item.fullAmount)
      if (item.startDate) result.startDate = item.startDate
      if (item.endHour) result.endHour = Number(item.endHour)
      if (item.notes) result.notes = item.notes
      if (item.storeName) result.storeName = item.storeName

      // 处理endDate（可能包含相对日期）
      if (item.endDate) {
        const endDate = item.endDate
        // 检查是否是相对日期（包含"今天/明天/后天/本周/下周/本月/下月/X天后"等）
        const isRelativeDate = /(?:今天|明天|后天|本周|下周|本月|下月|\d+天后|星期|周[一二三四六日])/i.test(endDate)

        if (isRelativeDate) {
          console.log('GLM识别到相对日期:', endDate, '，调用规则匹配进行转换')
          // 使用对应的行文本进行规则匹配
          let matchedLine = textLines[i] || text
          if (item.storeName) {
            // 尝试找到包含平台名称的行
            matchedLine = textLines.find(line => line.includes(item.storeName!)) || textLines[i] || text
          }

          console.log('使用行文本进行规则匹配:', matchedLine)
          const ruleResult = extractCouponInfo(matchedLine)
          if (ruleResult.endDate) {
            result.endDate = ruleResult.endDate
            if (ruleResult.endHour) result.endHour = ruleResult.endHour
            if (ruleResult.endMinute) result.endMinute = ruleResult.endMinute
          } else {
            result.endDate = endDate
          }
        } else {
          // 检查是否是混合格式（日期+中文时间），如"2024-12-31 23点"
          const dateTimePattern = /^(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})\s*(?:日号)?\s*(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分)?$/
          const dateTimeMatch = endDate.match(dateTimePattern)

          if (dateTimeMatch) {
            const datePart = dateTimeMatch[1]
            const hour = parseInt(dateTimeMatch[2])
            const minute = dateTimeMatch[3] ? parseInt(dateTimeMatch[3]) : 0

            const formattedDate = datePart
              .replace(/\//g, '-')
              .replace(/年/g, '-')
              .replace(/月/g, '-')
              .replace(/日/g, '')

            result.endDate = formattedDate
            if (hour >= 0 && hour <= 23) {
              result.endHour = hour
              if (minute >= 0 && minute <= 59) {
                result.endMinute = minute
              }
            }
          } else {
            // 纯日期格式
            let standardizedDate = endDate
              .replace(/\//g, '-')
              .replace(/年/g, '-')
              .replace(/月/g, '-')
              .replace(/日/g, '')

            if (!/^\d{4}-\d{2}-\d{2}$/.test(standardizedDate)) {
              const dateMatch = standardizedDate.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/)
              if (dateMatch) {
                standardizedDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
              }
            }

            result.endDate = standardizedDate
          }
        }
      }

      result.aiModel = 'glm'
      result.rawResponse = JSON.stringify(item)

      results.push(result)
    }

    return results

  } catch (error) {
    console.error('GLM批量抽取失败，回退到按行识别:', error)
    return text.split('\n').map(line => extractCouponInfo(line.trim()))
  }
}

/**
 * 使用AI提取优惠券信息（回退链：GLM → 豆包 → 规则匹配）
 */
async function extractCouponInfoWithAI(text: string, aiModel?: 'doubao' | 'glm', glmApiKey?: string, useFallback = true): Promise<ExtractedCouponInfo> {
  let result: ExtractedCouponInfo

  try {
    // 1. 优先使用指定的AI模型
    if (aiModel === 'glm') {
      result = await extractCouponInfoWithGLM(text, glmApiKey)
    } else if (aiModel === 'doubao') {
      result = await extractCouponInfoWithDoubao(text)
    } else {
      // 未指定模型，默认使用豆包AI
      result = await extractCouponInfoWithDoubao(text)
    }

    // 验证提取结果是否完整
    const isComplete = result.title && result.discountAmount && result.discountType && result.endDate

    if (isComplete || !useFallback) {
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
      const isComplete = result.title && result.discountAmount && result.discountType && result.endDate
      
      if (isComplete) {
        console.log('豆包提取成功')
        return result
      }
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
    const { text, useAI, aiModel, glmApiKey: requestGlmApiKey, useFallback = true, smartBatch = false } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: '请提供文本内容' },
        { status: 400 }
      )
    }

    // 智能批量抽取模式（仅支持GLM）
    if (smartBatch && aiModel === 'glm') {
      try {
        // 如果使用GLM模型，先尝试从多个来源获取API Key
        let finalGlmApiKey = requestGlmApiKey
        if (!finalGlmApiKey) {
          const { getWebDAVConfigFromRequest } = await import('@/lib/config')
          const webdavConfig = getWebDAVConfigFromRequest(request)
          if (webdavConfig?.glmApiKey) {
            finalGlmApiKey = webdavConfig.glmApiKey
          }
          if (!finalGlmApiKey && process.env.GLM_API_KEY) {
            finalGlmApiKey = process.env.GLM_API_KEY
          }
        }

        const results = await extractCouponsWithGLMBatch(text, finalGlmApiKey)

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
      extractedInfo = await extractCouponInfoWithAI(text, model, requestGlmApiKey, useFallback)
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
