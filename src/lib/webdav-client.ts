import { createClient, WebDAVClient } from "webdav"

export interface WebDAVConfig {
  url: string
  username: string
  password: string
}

let webdavClient: WebDAVClient | null = null

/**
 * 初始化 WebDAV 客户端
 */
export function initWebDAVClient(config: WebDAVConfig): WebDAVClient {
  webdavClient = createClient(config.url, {
    username: config.username,
    password: config.password,
  })
  return webdavClient
}

/**
 * 获取 WebDAV 客户端实例
 */
export function getWebDAVClient(): WebDAVClient {
  if (!webdavClient) {
    throw new Error("WebDAV 客户端未初始化，请先调用 initWebDAVClient")
  }
  return webdavClient
}

/**
 * 检查 WebDAV 连接
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = getWebDAVClient()
    await client.getDirectoryContents("/")
    return true
  } catch (error) {
    console.error("WebDAV 连接失败:", error)
    return false
  }
}

/**
 * 读取文件内容
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    const client = getWebDAVClient()
    const content = await client.getFileContents(filePath, { format: "text" })
    return content as string
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error)
    throw error
  }
}

/**
 * 写入文件内容
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  try {
    const client = getWebDAVClient()
    await client.putFileContents(filePath, content)
  } catch (error) {
    console.error(`写入文件失败: ${filePath}`, error)
    throw error
  }
}

/**
 * 删除文件
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const client = getWebDAVClient()
    await client.deleteFile(filePath)
  } catch (error) {
    console.error(`删除文件失败: ${filePath}`, error)
    throw error
  }
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const client = getWebDAVClient()
    await client.stat(filePath)
    return true
  } catch (error) {
    return false
  }
}

/**
 * 创建目录
 */
export async function createDirectory(dirPath: string): Promise<void> {
  try {
    const client = getWebDAVClient()
    await client.createDirectory(dirPath)
  } catch (error) {
    console.error(`创建目录失败: ${dirPath}`, error)
    throw error
  }
}
