import { NextRequest, NextResponse } from "next/server"
import { couponManager } from "@/storage/database"

/**
 * 导出优惠券
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { filter } = body

    // 使用 couponManager 导出优惠券
    const coupons = await couponManager.exportCoupons(filter || "all")

    // 生成导出数据
    const exportData = {
      exportTime: new Date().toISOString(),
      exportCount: coupons.length,
      coupons
    }

    // 返回JSON数据
    return NextResponse.json({
      success: true,
      data: exportData,
      filename: `coupons_${new Date().toISOString().split('T')[0]}.json`
    })
  } catch (error) {
    console.error("导出优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "导出优惠券失败" },
      { status: 500 }
    )
  }
}
