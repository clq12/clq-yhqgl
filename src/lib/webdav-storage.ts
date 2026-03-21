import {
  readFile,
  writeFile,
  fileExists,
  createDirectory,
} from "./webdav-client"
import { toLocalISOString } from "./datetime-utils"

const COUPONS_FILE = "/coupons/data.json"
const BACKUP_DIR = "/coupons/backups"

// WebDAV 专用的 Coupon 类型（使用字符串存储日期）
export interface WebDAVCoupon {
  id: string
  title: string
  description: string | null
  discountAmount: number | null
  discountType: 'amount' | 'percentage' | 'full' | 'group' | null // 折扣类型：amount(减免金额), percentage(折扣), full(满减), group(团购券)
  fullAmount: number | null // 满减门槛金额
  startDate: string // ISO 字符串
  endDate: string // ISO 字符串
  endHour: number | null // 截止小时，0-23，null表示23点
  endMinute: number | null // 截止分钟，0-59，null表示59分
  isReminded: boolean
  remindedDays: number[] // 记录已经提醒过的天数，如[7, 3, 1]
  isUsed: boolean // 是否已使用
  notes: string | null
  createdAt: string // ISO 字符串
  updatedAt: string | null // ISO 字符串
}

export interface CouponData {
  coupons: WebDAVCoupon[]
  lastModified: string
}

// 导出 WebDAVCoupon 为 Coupon（保持 API 兼容）
export type Coupon = WebDAVCoupon

/**
 * 初始化存储，确保目录存在
 */
export async function initStorage(): Promise<void> {
  try {
    // 检查主目录是否存在
    const dirExists = await fileExists("/coupons")
    if (!dirExists) {
      await createDirectory("/coupons")
    }

    // 检查备份目录是否存在
    const backupDirExists = await fileExists(BACKUP_DIR)
    if (!backupDirExists) {
      await createDirectory(BACKUP_DIR)
    }

    // 如果数据文件不存在，创建空数据
    const fileExistsResult = await fileExists(COUPONS_FILE)
    if (!fileExistsResult) {
      const initialData: CouponData = {
        coupons: [],
        lastModified: toLocalISOString(new Date()),
      }
      await writeFile(COUPONS_FILE, JSON.stringify(initialData, null, 2))
    }
  } catch (error) {
    console.error("初始化存储失败:", error)
    throw error
  }
}

/**
 * 读取所有优惠券
 */
export async function getAllCoupons(): Promise<Coupon[]> {
  try {
    await initStorage()
    const content = await readFile(COUPONS_FILE)
    const data: CouponData = JSON.parse(content)
    return data.coupons
  } catch (error) {
    console.error("读取优惠券失败:", error)
    return []
  }
}

/**
 * 保存所有优惠券
 */
export async function saveCoupons(coupons: Coupon[]): Promise<void> {
  try {
    console.log('=== saveCoupons 开始 ===')
    console.log('优惠券数量:', coupons.length)
    
    await initStorage()

    // 创建备份
    console.log('开始创建备份...')
    await createBackup()
    console.log('备份创建完成')

    const data: CouponData = {
      coupons,
      lastModified: toLocalISOString(new Date()),
    }
    
    console.log('准备写入文件，数据大小:', JSON.stringify(data).length, '字节')
    await writeFile(COUPONS_FILE, JSON.stringify(data, null, 2))
    console.log('文件写入成功')
  } catch (error) {
    console.error("保存优惠券失败:", error)
    throw error
  }
}

/**
 * 获取单个优惠券
 */
export async function getCouponById(id: string): Promise<Coupon | null> {
  const coupons = await getAllCoupons()
  return coupons.find((c) => c.id === id) || null
}

/**
 * 添加优惠券
 */
export async function addCoupon(coupon: Coupon): Promise<Coupon> {
  console.log('=== addCoupon 开始 ===')
  console.log('要添加的优惠券:', coupon.title)
  
  // 获取最新的优惠券列表
  const coupons = await getAllCoupons()
  console.log('当前优惠券数量:', coupons.length)
  
  // 添加新优惠券
  coupons.push(coupon)
  console.log('添加后优惠券数量:', coupons.length)
  
  // 保存
  await saveCoupons(coupons)
  console.log('保存成功')
  
  return coupon
}

/**
 * 更新优惠券
 */
export async function updateCoupon(id: string, updates: Partial<Coupon>): Promise<Coupon | null> {
  const coupons = await getAllCoupons()
  const index = coupons.findIndex((c) => c.id === id)

  if (index === -1) {
    return null
  }

  coupons[index] = {
    ...coupons[index],
    ...updates,
    updatedAt: toLocalISOString(new Date()),
  }

  await saveCoupons(coupons)
  return coupons[index]
}

/**
 * 删除优惠券
 */
export async function deleteCoupon(id: string): Promise<boolean> {
  const coupons = await getAllCoupons()
  const index = coupons.findIndex((c) => c.id === id)

  if (index === -1) {
    return false
  }

  coupons.splice(index, 1)
  await saveCoupons(coupons)
  return true
}

/**
 * 创建备份
 */
async function createBackup(): Promise<void> {
  try {
    const content = await readFile(COUPONS_FILE)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupFile = `${BACKUP_DIR}/backup-${timestamp}.json`
    await writeFile(backupFile, content)
  } catch (error) {
    console.error("创建备份失败:", error)
    // 不抛出错误，备份失败不应该影响主流程
  }
}

/**
 * 获取即将到期的优惠券（精确到小时，使用北京时间 UTC+8）
 * @param hours 提前多少小时提醒
 */
export async function getExpiringCouponsByHours(hours: number): Promise<Coupon[]> {
  const coupons = await getAllCoupons()
  const now = new Date()

  return coupons.filter((coupon) => {
    // 排除已使用的优惠券
    if (coupon.isUsed) {
      return false
    }

    // 获取截止时间的小时和分钟
    const endHour = (coupon as any).endHour
    const endMinute = (coupon as any).endMinute ?? 59

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

      // 设置截止时间（UTC时间）
      // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
      let utcHour = (endHour ?? 23) - 8
      if (utcHour < 0) {
        utcHour += 24
        endDate.setDate(endDate.getDate() - 1)
      }
      endDate.setUTCHours(utcHour, endMinute, 0, 0)
    }

    // 当前时间（UTC）
    const nowUTC = now.getTime()
    
    // 截止时间（UTC）
    const endTimeUTC = endDate.getTime()

    // 计算剩余小时数
    const diff = endTimeUTC - nowUTC
    const diffHours = Math.floor(diff / (1000 * 60 * 60))

    return diffHours >= 0 && diffHours <= hours
  })
}

/**
 * 获取在特定提醒时间点的优惠券（精确到小时，使用北京时间 UTC+8）
 * @param remindDays 提醒天数数组 [7, 3, 1]
 * @returns 返回需要在当前时刻提醒的优惠券列表
 */
export async function getCouponsToRemindNow(remindDays: number[] = [7, 3, 1]): Promise<{ coupons: Coupon[], reasonDays: number }> {
  const coupons = await getAllCoupons()
  const now = new Date()
  
  // 当前时间（UTC）
  const nowUTC = now.getTime()
  
  const needRemind: Coupon[] = []
  let matchedDays = 0

  for (const coupon of coupons) {
    // 排除已使用的优惠券
    if (coupon.isUsed) {
      continue
    }

    // 获取截止时间的小时和分钟
    const endHour = (coupon as any).endHour
    const endMinute = (coupon as any).endMinute ?? 59
    
    // 解析截止日期（使用UTC时间，避免时区影响）
    const endDate = new Date(coupon.endDate + 'T00:00:00Z')
    
    // 设置截止时间（UTC时间）
    // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
    let utcHour = (endHour ?? 23) - 8
    if (utcHour < 0) {
      utcHour += 24
      endDate.setDate(endDate.getDate() - 1)
    }
    endDate.setUTCHours(utcHour, endMinute, 0, 0)
    
    // 截止时间（UTC）
    const endTimeUTC = endDate.getTime()
    
    // 检查是否已经在该天数提醒过
    const remindedDays = (coupon as any).remindedDays || []

    // 遍历每个提醒天数
    for (const days of remindDays) {
      if (remindedDays.includes(days)) {
        continue // 已经提醒过，跳过
      }

      // 计算提前days天的时间点（UTC时间戳）
      const daysMs = days * 24 * 3600000
      const remindTime = endTimeUTC - daysMs

      // 检查当前时间是否在提醒时间点（精确到小时）
      // 计算当前小时和提醒小时的差值
      const diffHours = Math.abs((nowUTC - remindTime) / (1000 * 60 * 60))
      
      // 如果差值小于1小时，说明应该提醒
      if (diffHours < 1) {
        needRemind.push(coupon)
        matchedDays = days
        break // 匹配到一个天数就退出
      }
    }
  }

  return { coupons: needRemind, reasonDays: matchedDays }
}

/**
 * 获取即将到期的优惠券（按天计算，保留兼容性，使用北京时间 UTC+8）
 * @param days 提前多少天提醒
 */
export async function getExpiringCoupons(days: number): Promise<Coupon[]> {
  const coupons = await getAllCoupons()
  const now = new Date()

  return coupons.filter((coupon) => {
    // 排除已使用的优惠券
    if (coupon.isUsed) {
      return false
    }

    // 获取截止时间的小时和分钟
    const endHour = (coupon as any).endHour
    const endMinute = (coupon as any).endMinute ?? 59

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

      // 设置截止时间（UTC时间）
      // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
      let utcHour = (endHour ?? 23) - 8
      if (utcHour < 0) {
        utcHour += 24
        endDate.setDate(endDate.getDate() - 1)
      }
      endDate.setUTCHours(utcHour, endMinute, 0, 0)
    }

    // 当前时间（UTC）
    const nowUTC = now.getTime()

    // 截止时间（UTC）
    const endTimeUTC = endDate.getTime()

    const diff = endTimeUTC - nowUTC
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24))

    return diffDays >= 0 && diffDays <= days
  })
}

/**
 * 获取已过期的优惠券（使用北京时间 UTC+8）
 */
export async function getExpiredCoupons(): Promise<Coupon[]> {
  const coupons = await getAllCoupons()
  const now = new Date()

  return coupons.filter((coupon) => {
    // 获取截止时间的小时和分钟
    const endHour = (coupon as any).endHour
    const endMinute = (coupon as any).endMinute ?? 59

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

      // 设置截止时间（UTC时间）
      // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
      let utcHour = (endHour ?? 23) - 8
      if (utcHour < 0) {
        utcHour += 24
        endDate.setDate(endDate.getDate() - 1)
      }
      endDate.setUTCHours(utcHour, endMinute, 0, 0)
    }

    // 当前时间（UTC）
    const nowUTC = now.getTime()

    // 截止时间（UTC）
    const endTimeUTC = endDate.getTime()

    return endTimeUTC < nowUTC
  })
}

/**
 * 获取有效的优惠券
 */
export async function getActiveCoupons(): Promise<Coupon[]> {
  const coupons = await getAllCoupons()
  const now = new Date()

  return coupons.filter((coupon) => {
    const endDate = new Date(coupon.endDate)
    return endDate >= now
  })
}
