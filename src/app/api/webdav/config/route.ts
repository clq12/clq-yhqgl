import { NextRequest, NextResponse } from "next/server"
import { getWebDAVConfigFromRequest, setConfigCookie, clearConfigCookie } from "@/lib/config"

export interface WebDAVConfigRequest {
  url: string
  username: string
  password: string
  pushplusToken?: string
  chatgptApiKey?: string
  api52Key?: string
}

// 获取配置 - 数据库版本，始终返回已配置
export async function GET(request: NextRequest) {
  try {
    const config = getWebDAVConfigFromRequest(request)

    // 脱敏处理 PushPlus Token
    const maskedPushPlusToken = config?.pushplusToken
      ? config.pushplusToken.substring(0, 4) + "****" + config.pushplusToken.substring(config.pushplusToken.length - 4)
      : ""

    // 脱敏处理 ChatGPT API Key
    const maskedChatgptApiKey = config?.chatgptApiKey
      ? config.chatgptApiKey.substring(0, 4) + "****" + config.chatgptApiKey.substring(config.chatgptApiKey.length - 4)
      : ""

    // 脱敏处理 52api Key
    const maskedApi52Key = config?.api52Key
      ? config.api52Key.substring(0, 4) + "****" + config.api52Key.substring(config.api52Key.length - 4)
      : ""

    // 数据库版本始终返回已配置
    return NextResponse.json({
      success: true,
      configured: true, // 数据库版本始终已配置
      config: {
        url: config?.url || "",
        username: config?.username || "",
        pushplusToken: maskedPushPlusToken,
        hasPushPlusToken: !!config?.pushplusToken && config.pushplusToken.length > 0,
        chatgptApiKey: maskedChatgptApiKey,
        hasChatgptApiKey: !!config?.chatgptApiKey && config.chatgptApiKey.length > 0,
        api52Key: maskedApi52Key,
        hasApi52Key: !!config?.api52Key && config.api52Key.length > 0,
      },
    })
  } catch (error) {
    console.error("获取配置失败:", error)
    // 即使出错，数据库版本也返回已配置
    return NextResponse.json({
      success: true,
      configured: true,
    })
  }
}

// 保存配置 - 只保存PushPlus Token和ChatGPT API Key等配置
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WebDAVConfigRequest

    const config = {
      url: body.url?.trim() || "",
      username: body.username?.trim() || "",
      password: body.password || "",
      pushplusToken: body.pushplusToken?.trim() || "",
      chatgptApiKey: body.chatgptApiKey?.trim() || "",
      api52Key: body.api52Key?.trim() || "",
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
