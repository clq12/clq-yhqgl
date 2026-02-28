export interface WebDAVConfig {
  url: string
  username: string
  password: string
  pushplusToken?: string // PushPlus 推送令牌
  glmApiKey?: string // GLM-4.7-Flash API Key
  api52Key?: string // 52api API Key
}

const CONFIG_COOKIE_NAME = "webdav_config"
const CONFIG_LOCAL_STORAGE_KEY = "webdav_config"

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
 * 增加Max-Age到365天，确保持久化
 */
export function setConfigCookie(response: Response, config: WebDAVConfig): void {
  const encoded = Buffer.from(JSON.stringify(config)).toString("base64")
  const isSecure = process.env.NODE_ENV === "production"

  // 延长有效期到365天，确保配置不会因过期而丢失
  response.headers.set(
    "Set-Cookie",
    `${CONFIG_COOKIE_NAME}=${encoded}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=lax${isSecure ? "; Secure" : ""}`
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

/**
 * 从 localStorage 读取配置（客户端使用）
 */
export function getWebDAVConfigFromLocalStorage(): WebDAVConfig | null {
  if (typeof window === "undefined") return null

  try {
    const config = localStorage.getItem(CONFIG_LOCAL_STORAGE_KEY)
    if (!config) return null

    return JSON.parse(config) as WebDAVConfig
  } catch (error) {
    console.error("从 localStorage 读取配置失败:", error)
    return null
  }
}

/**
 * 保存配置到 localStorage（客户端使用）
 */
export function setWebDAVConfigToLocalStorage(config: WebDAVConfig): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(CONFIG_LOCAL_STORAGE_KEY, JSON.stringify(config))
  } catch (error) {
    console.error("保存配置到 localStorage 失败:", error)
  }
}

/**
 * 从 localStorage 清除配置（客户端使用）
 */
export function clearWebDAVConfigFromLocalStorage(): void {
  if (typeof window === "undefined") return

  try {
    localStorage.removeItem(CONFIG_LOCAL_STORAGE_KEY)
  } catch (error) {
    console.error("清除 localStorage 配置失败:", error)
  }
}

/**
 * 导出配置为JSON（用于备份）
 */
export function exportConfig(config: WebDAVConfig): string {
  return JSON.stringify(config, null, 2)
}

/**
 * 从JSON导入配置（用于恢复）
 */
export function importConfig(jsonString: string): WebDAVConfig | null {
  try {
    const config = JSON.parse(jsonString) as WebDAVConfig

    // 验证必填字段
    if (!config.url || !config.username || !config.password) {
      throw new Error("配置文件不完整")
    }

    return config
  } catch (error) {
    console.error("导入配置失败:", error)
    return null
  }
}
