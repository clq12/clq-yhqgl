import { NextRequest, NextResponse } from "next/server"
import { couponManager } from "@/storage/database"

/**
 * 导出优惠券
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filter = (searchParams.get("filter") as "all" | "used" | "unused" | "expired") || "all"

    const coupons = await couponManager.exportCoupons(filter)

    return NextResponse.json({
      success: true,
      data: coupons,
      exportedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("导出优惠券失败:", error)
    return NextResponse.json(
      { success: false, error: "导出优惠券失败" },
      { status: 500 }
    )
  }
}
