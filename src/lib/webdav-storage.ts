import {
  readFile,
  writeFile,
  fileExists,
  createDirectory,
} from "./webdav-client"
import type { Coupon } from "@/storage/database/shared/schema"

const COUPONS_FILE = "/coupons/data.json"
const BACKUP_DIR = "/coupons/backups"

export interface CouponData {
  coupons: Coupon[]
  lastModified: string
}

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
 * 获取即将到期的优惠券
 */
export async function getExpiringCoupons(days: number): Promise<Coupon[]> {
  const coupons = await getAllCoupons()
  const now = new Date()
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  return coupons.filter((coupon) => {
    const endDate = new Date(coupon.endDate)
    return endDate >= now && endDate <= futureDate
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
