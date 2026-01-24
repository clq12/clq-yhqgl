import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfig } from "@/lib/config"
import { initWebDAVClient } from "@/lib/webdav-client"
import { updateCoupon } from "@/lib/webdav-storage"

// 标记优惠券为已提醒
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const config = getWebDAVConfig()

    if (!config) {
      return NextResponse.json(
        { success: false, error: "请先配置 WebDAV" },
        { status: 400 }
      )
    }

    initWebDAVClient(config)
    const coupon = await updateCoupon(id, { isReminded: true })

    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "优惠券不存在" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: coupon })
  } catch (error) {
    console.error("标记提醒失败:", error)
    return NextResponse.json(
      { success: false, error: "标记提醒失败" },
      { status: 500 }
    )
  }
}
