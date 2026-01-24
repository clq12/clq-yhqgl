import { cookies } from "next/headers"

export interface WebDAVConfig {
  url: string
  username: string
  password: string
}

const CONFIG_COOKIE_NAME = "webdav_config"

/**
 * 保存 WebDAV 配置到 Cookie
 */
export function saveWebDAVConfig(config: WebDAVConfig): void {
  const cookieStore = cookies()
  const encoded = Buffer.from(JSON.stringify(config)).toString("base64")
  cookieStore.set(CONFIG_COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 天
  })
}

/**
 * 从 Cookie 获取 WebDAV 配置
 */
export function getWebDAVConfig(): WebDAVConfig | null {
  try {
    const cookieStore = cookies()
    const config = cookieStore.get(CONFIG_COOKIE_NAME)

    if (!config) {
      return null
    }

    const decoded = Buffer.from(config.value, "base64").toString("utf-8")
    return JSON.parse(decoded) as WebDAVConfig
  } catch (error) {
    console.error("获取配置失败:", error)
    return null
  }
}

/**
 * 清除 WebDAV 配置
 */
export function clearWebDAVConfig(): void {
  const cookieStore = cookies()
  cookieStore.delete(CONFIG_COOKIE_NAME)
}
