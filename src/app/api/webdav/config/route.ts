import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, setConfigCookie, clearConfigCookie } from "@/lib/config"
import { initWebDAVClient, checkConnection } from "@/lib/webdav-client"

export interface WebDAVConfigRequest {
  url: string
  username: string
  password: string
}

// 获取配置
export async function GET(request: NextRequest) {
  try {
    const config = getWebDAVConfigFromRequest(request)

    if (!config) {
      return NextResponse.json({ success: true, configured: false })
    }

    // 不返回密码
    return NextResponse.json({
      success: true,
      configured: true,
      config: {
        url: config.url,
        username: config.username,
      },
    })
  } catch (error) {
    console.error("获取配置失败:", error)
    return NextResponse.json(
      { success: false, error: "获取配置失败" },
      { status: 500 }
    )
  }
}

// 保存配置
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WebDAVConfigRequest

    // 验证必填字段
    if (!body.url || !body.username || !body.password) {
      return NextResponse.json(
        { success: false, error: "请填写完整的配置信息" },
        { status: 400 }
      )
    }

    // 规范化 URL
    let url = body.url.trim()
    if (!url.endsWith("/")) {
      url += "/"
    }

    const config = {
      url,
      username: body.username.trim(),
      password: body.password,
    }

    // 测试连接
    initWebDAVClient(config)
    const connected = await checkConnection()

    if (!connected) {
      return NextResponse.json(
        { success: false, error: "WebDAV 连接失败，请检查配置信息" },
        { status: 400 }
      )
    }

    // 创建响应并设置 Cookie
    const response = NextResponse.json({ success: true, message: "配置保存成功" })
    setConfigCookie(response, config)

    return response
  } catch (error) {
    console.error("保存配置失败:", error)
    return NextResponse.json(
      { success: false, error: "保存配置失败" },
      { status: 500 }
    )
  }
}

// 清除配置
export async function DELETE() {
  try {
    const response = NextResponse.json({ success: true, message: "配置已清除" })
    clearConfigCookie(response)
    return response
  } catch (error) {
    console.error("清除配置失败:", error)
    return NextResponse.json(
      { success: false, error: "清除配置失败" },
      { status: 500 }
    )
  }
}
