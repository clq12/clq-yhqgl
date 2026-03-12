import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, WebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import { getAllCoupons, saveCoupons } from "@/lib/webdav-storage"
import { toLocalISOString, formatLocalDate } from "@/lib/datetime-utils"

/**
 * 从环境变量获取配置（用于定时任务）
 */
function getConfigFromEnv(): WebDAVConfig | null {
  const {
    WEBDAV_URL,
    WEBDAV_USERNAME,
    WEBDAV_PASSWORD,
  } = process.env

  if (WEBDAV_URL && WEBDAV_USERNAME && WEBDAV_PASSWORD) {
    const config: WebDAVConfig = {
      url: WEBDAV_URL,
      username: WEBDAV_USERNAME,
      password: WEBDAV_PASSWORD,
    }

    return config
  }

  return null
}

/**
 * 导入优惠券
 */
export async function POST(request: NextRequest) {
  try {
    let config = getConfigFromEnv()

    if (!config) {
      config = getWebDAVConfigFromRequest(request)
    }

    if (!config) {
      return NextResponse.json(
        { success: false, error: "请先配置 WebDAV" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { coupons, mode } = body // mode: 'skip' | 'overwrite' | 'merge'

    if (!coupons || !Array.isArray(coupons) || coupons.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供要导入的优惠券数据" },
        { status: 400 }
      )
    }

    // 初始化 WebDAV 客户端
    initWebDAVClient(config)

    // 获取所有现有优惠券
    const existingCoupons = await getAllCoupons()
    const existingTitles = new Set(existingCoupons.map(c => c.title))

    let importedCoupons: any[] = []
    let skippedCoupons: any[] = []
    let overwrittenCoupons: any[] = []

    // 根据导入模式处理
    switch (mode) {
      case 'skip':
        // 跳过重复的
        importedCoupons = coupons
          .filter((c: any) => !existingTitles.has(c.title))
          .map((c: any) => {
            // 处理日期：只存储日期部分（YYYY-MM-DD），时间由 endHour/endMinute 单独存储
            const endHour = c.endHour ?? 23
            const endMinute = c.endMinute ?? 59
            const extractDate = (dateValue: any): string => {
              if (!dateValue) return formatLocalDate(new Date())
              if (typeof dateValue === 'string') {
                if (dateValue.includes('T')) return dateValue.split('T')[0]
                if (dateValue.endsWith('Z')) {
                  const d = new Date(dateValue)
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                }
                return dateValue
              }
              return formatLocalDate(new Date())
            }

            return {
              ...c,
              id: c.id || crypto.randomUUID(),
              startDate: extractDate(c.startDate),
              endDate: extractDate(c.endDate),
              endHour: endHour,
              endMinute: endMinute,
              createdAt: c.createdAt || toLocalISOString(new Date()),
              isReminded: false,
              remindedDays: c.remindedDays || [],
              isUsed: c.isUsed ?? false,
            }
          })
        skippedCoupons = coupons.filter((c: any) => existingTitles.has(c.title))
        break

      case 'overwrite':
        // 覆盖重复的
        const titles = new Set(coupons.map((c: any) => c.title))
        const nonOverwritten = existingCoupons.filter(c => !titles.has(c.title))

        importedCoupons = coupons.map((c: any) => {
          // 处理日期：只存储日期部分（YYYY-MM-DD），时间由 endHour/endMinute 单独存储
          const endHour = c.endHour ?? 23
          const endMinute = c.endMinute ?? 59
          const extractDate = (dateValue: any): string => {
            if (!dateValue) return formatLocalDate(new Date())
            if (typeof dateValue === 'string') {
              if (dateValue.includes('T')) return dateValue.split('T')[0]
              if (dateValue.endsWith('Z')) {
                const d = new Date(dateValue)
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              }
              return dateValue
            }
            return formatLocalDate(new Date())
          }

          return {
            ...c,
            id: c.id || crypto.randomUUID(),
            startDate: extractDate(c.startDate),
            endDate: extractDate(c.endDate),
            endHour: endHour,
            endMinute: endMinute,
            createdAt: c.createdAt || toLocalISOString(new Date()),
            isReminded: false,
            remindedDays: c.remindedDays || [],
            isUsed: c.isUsed ?? false,
          }
        })
        overwrittenCoupons = existingCoupons.filter(c => titles.has(c.title))

        await saveCoupons([...nonOverwritten, ...importedCoupons])

        return NextResponse.json({
          success: true,
          message: `成功导入 ${importedCoupons.length} 个优惠券，覆盖了 ${overwrittenCoupons.length} 个重复项`,
          data: {
            importedCount: importedCoupons.length,
            overwrittenCount: overwrittenCoupons.length,
            skippedCount: 0,
          }
        })

      case 'merge':
      default:
        // 合并模式：导入所有，包括重复的
        importedCoupons = coupons.map((c: any) => {
          // 处理日期：只存储日期部分（YYYY-MM-DD），时间由 endHour/endMinute 单独存储
          const endHour = c.endHour ?? 23
          const endMinute = c.endMinute ?? 59
          const extractDate = (dateValue: any): string => {
            if (!dateValue) return formatLocalDate(new Date())
            if (typeof dateValue === 'string') {
              if (dateValue.includes('T')) return dateValue.split('T')[0]
              if (dateValue.endsWith('Z')) {
                const d = new Date(dateValue)
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              }
              return dateValue
            }
            return formatLocalDate(new Date())
          }

          return {
            ...c,
            id: crypto.randomUUID(), // 总是生成新ID
            startDate: extractDate(c.startDate),
            endDate: extractDate(c.endDate),
            endHour: endHour,
            endMinute: endMinute,
            createdAt: toLocalISOString(new Date()),
            isReminded: false,
            remindedDays: c.remindedDays || [],
            isUsed: c.isUsed ?? false,
          }
        })
        break
    }

    // 保存更新后的优惠券
    await saveCoupons([...existingCoupons, ...importedCoupons])

    return NextResponse.json({
      success: true,
      message: `成功导入 ${importedCoupons.length} 个优惠券${skippedCoupons.length > 0 ? `，跳过了 ${skippedCoupons.length} 个重复项` : ''}`,
      data: {
        importedCount: importedCoupons.length,
        overwrittenCount: overwrittenCoupons.length,
        skippedCount: skippedCoupons.length,
        total: existingCoupons.length + importedCoupons.length,
      }
    })
  } catch (error) {
    console.error("导入优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "导入优惠券失败" },
      { status: 500 }
    )
  }
}
