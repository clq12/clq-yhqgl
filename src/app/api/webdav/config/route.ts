import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, setConfigCookie, clearConfigCookie } from "@/lib/config"
import { initWebDAVClient, checkConnection } from "@/lib/webdav-client"

export interface WebDAVConfigRequest {
  url: string
  username: string
  password: string
  pushplusToken?: string
  glmApiKey?: string
}

// 获取配置
export async function GET(request: NextRequest) {
  try {
    const config = getWebDAVConfigFromRequest(request)

    if (!config) {
      return NextResponse.json({ success: true, configured: false })
    }

    // 脱敏处理 PushPlus Token
    const maskedPushPlusToken = config.pushplusToken
      ? config.pushplusToken.substring(0, 4) + "****" + config.pushplusToken.substring(config.pushplusToken.length - 4)
      : ""

    // 脱敏处理 GLM API Key
    const maskedGlmApiKey = config.glmApiKey
      ? config.glmApiKey.substring(0, 4) + "****" + config.glmApiKey.substring(config.glmApiKey.length - 4)
      : ""

    // 不返回密码，但返回脱敏后的 Token
    return NextResponse.json({
      success: true,
      configured: true,
      config: {
        url: config.url,
        username: config.username,
        pushplusToken: maskedPushPlusToken,
        hasPushPlusToken: !!config.pushplusToken && config.pushplusToken.length > 0,
        glmApiKey: maskedGlmApiKey,
        hasGlmApiKey: !!config.glmApiKey && config.glmApiKey.length > 0,
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
      pushplusToken: body.pushplusToken?.trim() || "",
      glmApiKey: body.glmApiKey?.trim() || "",
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
