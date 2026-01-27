import {
  readFile,
  writeFile,
  fileExists,
  createDirectory,
} from "./webdav-client"

const COUPONS_FILE = "/coupons/data.json"
const BACKUP_DIR = "/coupons/backups"

// WebDAV 专用的 Coupon 类型（使用字符串存储日期）
export interface WebDAVCoupon {
  id: string
  title: string
  description: string | null
  discountAmount: number | null
  discountType: 'amount' | 'percentage' | 'full' | null // 折扣类型：amount(减免金额), percentage(折扣), full(满减)
  startDate: string // ISO 字符串
  endDate: string // ISO 字符串
  endHour: number | null // 截止小时，0-23，null表示23点
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
        lastModified: new Date().toISOString(),
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
    await initStorage()

    // 创建备份
    await createBackup()

    const data: CouponData = {
      coupons,
      lastModified: new Date().toISOString(),
    }
    await writeFile(COUPONS_FILE, JSON.stringify(data, null, 2))
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
  const coupons = await getAllCoupons()
  coupons.push(coupon)
  await saveCoupons(coupons)
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
    updatedAt: new Date().toISOString(),
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
 * 获取即将到期的优惠券（精确到小时）
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

    const endDate = new Date(coupon.endDate)
    const endHour = (coupon as any).endHour

    // 设置截止时间的小时数
    if (endHour !== null && endHour !== undefined) {
      endDate.setHours(endHour, 0, 0, 0)
    } else {
      endDate.setHours(23, 0, 0, 0)
    }

    // 计算剩余小时数
    const diff = endDate.getTime() - now.getTime()
    const diffHours = Math.ceil(diff / (1000 * 60 * 60))

    return diffHours >= 0 && diffHours <= hours
  })
}

/**
 * 获取在特定提醒时间点的优惠券（精确到小时）
 * @param remindDays 提醒天数数组 [7, 3, 1]
 * @returns 返回需要在当前时刻提醒的优惠券列表
 */
export async function getCouponsToRemindNow(remindDays: number[] = [7, 3, 1]): Promise<{ coupons: Coupon[], reasonDays: number }> {
  const coupons = await getAllCoupons()
  const now = new Date()
  const currentHour = now.getHours()

  const needRemind: Coupon[] = []
  let matchedDays = 0

  for (const coupon of coupons) {
    // 排除已使用的优惠券
    if (coupon.isUsed) {
      continue
    }

    const endDate = new Date(coupon.endDate)
    const endHour = (coupon as any).endHour || 23

    // 设置截止时间的小时数
    endDate.setHours(endHour, 0, 0, 0)

    // 检查是否已经在该天数提醒过
    const remindedDays = (coupon as any).remindedDays || []

    // 遍历每个提醒天数
    for (const days of remindDays) {
      if (remindedDays.includes(days)) {
        continue // 已经提醒过，跳过
      }

      // 计算提前days天的时间点
      const remindDate = new Date(endDate)
      remindDate.setDate(remindDate.getDate() - days)

      // 检查当前时间是否在提醒时间点（精确到小时）
      // 例如：7天前23点过期，应该在今天23点提醒
      if (remindDate.getFullYear() === now.getFullYear() &&
          remindDate.getMonth() === now.getMonth() &&
          remindDate.getDate() === now.getDate() &&
          remindDate.getHours() === currentHour) {
        needRemind.push(coupon)
        matchedDays = days
        break // 匹配到一个天数就退出
      }
    }
  }

  return { coupons: needRemind, reasonDays: matchedDays }
}

/**
 * 获取即将到期的优惠券（按天计算，保留兼容性）
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

    const endDate = new Date(coupon.endDate)
    const endHour = (coupon as any).endHour

    // 设置截止时间的小时数
    if (endHour !== null && endHour !== undefined) {
      endDate.setHours(endHour, 0, 0, 0)
    } else {
      endDate.setHours(23, 0, 0, 0)
    }

    const diff = endDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24))

    return diffDays >= 0 && diffDays <= days
  })
}

/**
 * 获取已过期的优惠券
 */
export async function getExpiredCoupons(): Promise<Coupon[]> {
  const coupons = await getAllCoupons()
  const now = new Date()

  return coupons.filter((coupon) => {
    const endDate = new Date(coupon.endDate)
    const endHour = (coupon as any).endHour

    // 设置截止时间的小时数
    if (endHour !== null && endHour !== undefined) {
      endDate.setHours(endHour, 0, 0, 0)
    } else {
      endDate.setHours(23, 0, 0, 0)
    }

    return endDate < now
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
