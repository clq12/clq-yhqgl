export interface WebDAVConfig {
  url: string
  username: string
  password: string
  pushplusToken?: string // PushPlus 推送令牌
}

const CONFIG_COOKIE_NAME = "webdav_config"

/**
 * 从 Request Headers 读取 Cookie 中的 WebDAV 配置
 */
export function getWebDAVConfigFromRequest(request: Request): WebDAVConfig | null {
  try {
    const cookieHeader = request.headers.get("cookie")
    if (!cookieHeader) {
      return null
    }

    const cookies = Object.fromEntries(
      cookieHeader.split(";").map(cookie => {
        const [name, ...values] = cookie.trim().split("=")
        return [name, values.join("=")]
      })
    )

    const config = cookies[CONFIG_COOKIE_NAME]
    if (!config) {
      return null
    }

    const decoded = Buffer.from(config, "base64").toString("utf-8")
    return JSON.parse(decoded) as WebDAVConfig
  } catch (error) {
    console.error("获取配置失败:", error)
    return null
  }
}

/**
 * 设置 Cookie 响应头
 */
export function setConfigCookie(response: Response, config: WebDAVConfig): void {
  const encoded = Buffer.from(JSON.stringify(config)).toString("base64")
  const isSecure = process.env.NODE_ENV === "production"

  response.headers.set(
    "Set-Cookie",
    `${CONFIG_COOKIE_NAME}=${encoded}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=lax${isSecure ? "; Secure" : ""}`
  )
}

/**
 * 清除 Cookie 响应头
 */
export function clearConfigCookie(response: Response): void {
  response.headers.set(
    "Set-Cookie",
    `${CONFIG_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=lax`
  )
}
