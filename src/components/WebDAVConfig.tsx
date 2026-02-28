"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel as FormLabelField, FormMessage } from "@/components/ui/form"
import { Loader2, CheckCircle, XCircle, Info, Download, Upload } from "lucide-react"
import {
  getWebDAVConfigFromLocalStorage,
  setWebDAVConfigToLocalStorage,
  clearWebDAVConfigFromLocalStorage,
  exportConfig,
  importConfig,
  type WebDAVConfig
} from "@/lib/config"

const webdavConfigSchema = z.object({
  url: z.string().min(1, "WebDAV 地址不能为空").url("请输入有效的 URL"),
  username: z.string().min(1, "用户名不能为空"),
  password: z.string().min(1, "密码不能为空"),
  pushplusToken: z.string().optional(),
  glmApiKey: z.string().optional(),
  api52Key: z.string().optional(),
})

type WebDAVConfigForm = z.infer<typeof webdavConfigSchema>

export default function WebDAVConfig() {
  const [isConfigured, setIsConfigured] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [configUrl, setConfigUrl] = useState("")
  const [hasPushPlusToken, setHasPushPlusToken] = useState(false)
  const [hasGlmApiKey, setHasGlmApiKey] = useState(false)
  const [hasApi52Key, setHasApi52Key] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const form = useForm<WebDAVConfigForm>({
    resolver: zodResolver(webdavConfigSchema),
    defaultValues: {
      url: "",
      username: "",
      password: "",
    },
  })

  useEffect(() => {
    checkConfig()
  }, [])

  const checkConfig = async () => {
    try {
      // 优先从 localStorage 读取配置
      const localConfig = getWebDAVConfigFromLocalStorage()
      if (localConfig) {
        setIsConfigured(true)
        setConfigUrl(localConfig.url)
        setHasPushPlusToken(!!localConfig.pushplusToken && localConfig.pushplusToken.length > 0)
        setHasGlmApiKey(!!localConfig.glmApiKey && localConfig.glmApiKey.length > 0)
        setHasApi52Key(!!localConfig.api52Key && localConfig.api52Key.length > 0)
        return
      }

      // localStorage 没有，再从服务器 Cookie 读取
      const response = await fetch("/api/webdav/config")
      const result = await response.json()
      if (result.success && result.configured) {
        setIsConfigured(true)
        setConfigUrl(result.config.url)
        setHasPushPlusToken(result.config.hasPushPlusToken || false)
        setHasGlmApiKey(result.config.hasGlmApiKey || false)
        setHasApi52Key(result.config.hasApi52Key || false)
      }
    } catch (error) {
      console.error("检查配置失败:", error)
    }
  }

  const onSubmit = async (data: WebDAVConfigForm) => {
    try {
      setIsSaving(true)
      setMessage(null)

      const response = await fetch("/api/webdav/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (result.success) {
        // 同时保存到 localStorage（双重保险）
        const config: WebDAVConfig = {
          url: data.url,
          username: data.username,
          password: data.password,
          pushplusToken: data.pushplusToken || undefined,
          glmApiKey: data.glmApiKey || undefined,
          api52Key: data.api52Key || undefined,
        }
        setWebDAVConfigToLocalStorage(config)

        setMessage({ type: "success", text: "配置保存成功！" })
        setIsConfigured(true)
        setIsEditing(false)
        setConfigUrl(data.url)
        setHasPushPlusToken(!!data.pushplusToken && data.pushplusToken.length > 0)
        setHasGlmApiKey(!!data.glmApiKey && data.glmApiKey.length > 0)
        setHasApi52Key(!!data.api52Key && data.api52Key.length > 0)
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        setMessage({ type: "error", text: result.error || "配置保存失败" })
      }
    } catch (error) {
      console.error("保存配置失败:", error)
      setMessage({ type: "error", text: "保存配置失败，请重试" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleClearConfig = async () => {
    if (!confirm("确定要清除 WebDAV 配置吗？")) {
      return
    }

    try {
      const response = await fetch("/api/webdav/config", {
        method: "DELETE",
      })

      const result = await response.json()

      if (result.success) {
        // 同时清除 localStorage
        clearWebDAVConfigFromLocalStorage()

        setIsConfigured(false)
        setConfigUrl("")
        setHasPushPlusToken(false)
        setHasGlmApiKey(false)
        setHasApi52Key(false)
        form.reset()
        setMessage({ type: "success", text: "配置已清除" })
      } else {
        setMessage({ type: "error", text: result.error || "清除配置失败" })
      }
    } catch (error) {
      console.error("清除配置失败:", error)
      setMessage({ type: "error", text: "清除配置失败，请重试" })
    }
  }

  // 导出配置
  const handleExportConfig = () => {
    const config = getWebDAVConfigFromLocalStorage()
    if (!config) {
      setMessage({ type: "error", text: "没有可导出的配置" })
      return
    }

    try {
      const configJson = exportConfig(config)
      const blob = new Blob([configJson], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `webdav_config_${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setMessage({ type: "success", text: "配置已导出" })
    } catch (error) {
      console.error("导出配置失败:", error)
      setMessage({ type: "error", text: "导出配置失败" })
    }
  }

  // 导入配置
  const handleImportConfig = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const content = await file.text()
        const config = importConfig(content)

        if (!config) {
          setMessage({ type: "error", text: "配置文件格式错误" })
          return
        }

        // 同时保存到 Cookie 和 localStorage
        setWebDAVConfigToLocalStorage(config)

        const response = await fetch("/api/webdav/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        })

        const result = await response.json()

        if (result.success) {
          setMessage({ type: "success", text: "配置导入成功！" })
          setIsConfigured(true)
          setIsEditing(false)
          setConfigUrl(config.url)
          setHasPushPlusToken(!!config.pushplusToken && config.pushplusToken.length > 0)
          setTimeout(() => {
            window.location.reload()
          }, 1000)
        } else {
          setMessage({ type: "error", text: result.error || "配置导入失败" })
        }
      } catch (error) {
        console.error("导入配置失败:", error)
        setMessage({ type: "error", text: "导入配置失败" })
      }
    }
    input.click()
  }

  if (isConfigured && !isEditing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                WebDAV 已配置
                <CheckCircle className="h-5 w-5 text-green-600" />
              </CardTitle>
              <CardDescription className="mt-2">
                已连接到: {configUrl}
              </CardDescription>
              {hasPushPlusToken && (
                <div className="flex items-center gap-2 mt-3 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-md inline-flex">
                  <CheckCircle className="h-4 w-4" />
                  PushPlus 微信推送已启用
                </div>
              )}
              {!hasPushPlusToken && (
                <div className="flex items-center gap-2 mt-3 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md inline-flex">
                  <Info className="h-4 w-4" />
                  PushPlus 未配置（可选）
                </div>
              )}
              {hasGlmApiKey && (
                <div className="flex items-center gap-2 mt-3 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-md inline-flex">
                  <CheckCircle className="h-4 w-4" />
                  GLM-4.7-Flash AI 已配置
                </div>
              )}
              {!hasGlmApiKey && (
                <div className="flex items-center gap-2 mt-3 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md inline-flex">
                  <Info className="h-4 w-4" />
                  GLM-4.7-Flash 未配置（可选，豆包已免费提供）
                </div>
              )}
              {hasApi52Key && (
                <div className="flex items-center gap-2 mt-3 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-md inline-flex">
                  <CheckCircle className="h-4 w-4" />
                  52api 油价查询已配置
                </div>
              )}
              {!hasApi52Key && (
                <div className="flex items-center gap-2 mt-3 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md inline-flex">
                  <Info className="h-4 w-4" />
                  52api 未配置（可选，用于油价查询）
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setIsEditing(true)}
                className="gap-2"
              >
                重新编辑
              </Button>
              <Button
                variant="outline"
                onClick={handleClearConfig}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 gap-2"
              >
                清除配置
              </Button>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-2">备份与恢复：</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportConfig}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  导出配置
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleImportConfig}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  导入配置
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "重新编辑配置" : "配置 WebDAV"}</CardTitle>
        <CardDescription>
          {isEditing
            ? "修改 WebDAV 和 PushPlus 配置"
            : "配置 WebDAV 服务以存储优惠券数据"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* 使用提示 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-medium mb-1">支持的 WebDAV 服务：</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                  <li>坚果云（推荐，免费）</li>
                  <li>Nextcloud / ownCloud</li>
                  <li>群晖 NAS</li>
                  <li>其他支持 WebDAV 的服务</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 配置表单 */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabelField>WebDAV 地址</FormLabelField>
                    <FormControl>
                      <Input
                        placeholder="例如：https://dav.jianguoyun.com/dav/"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabelField>用户名</FormLabelField>
                    <FormControl>
                      <Input placeholder="输入您的用户名" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabelField>密码</FormLabelField>
                    <FormControl>
                      <Input type="password" placeholder="输入您的密码" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pushplusToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabelField>PushPlus Token（可选）</FormLabelField>
                    <FormControl>
                      <Input
                        placeholder="输入 PushPlus Token 用于微信推送"
                        {...field}
                      />
                    </FormControl>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      获取 Token：<a
                        href="http://www.pushplus.plus/push1.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        PushPlus 官网
                      </a>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="glmApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabelField>GLM-4.7-Flash API Key（可选）</FormLabelField>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="输入 GLM-4.7-Flash API Key"
                        {...field}
                      />
                    </FormControl>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      获取 API Key：<a
                        href="https://open.bigmodel.cn/usercenter/apikeys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        智谱AI控制台
                      </a>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      用于AI识别优惠券，不配置则使用豆包模型（免费）
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="api52Key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabelField>52api API Key（可选）</FormLabelField>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="输入 52api API Key"
                        {...field}
                      />
                    </FormControl>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      获取 API Key：<a
                        href="https://www.52vmy.cn/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        52api 官网
                      </a>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      用于查询当前油价，不配置则使用AI搜索获取油价信息
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* PushPlus 使用说明 */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-900 dark:text-amber-100">
                    <p className="font-medium mb-1">微信推送功能：</p>
                    <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-200">
                      <li>配置 Token 后可自动推送即将到期的优惠券</li>
                      <li>提前 7天、3天、1天 分别提醒</li>
                      <li>需要配合定时任务（如 cron-job.org）每天调用检查 API</li>
                      <li>检查 API：<code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">/api/check-expiring</code></li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 油价推送说明 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-900 dark:text-blue-100">
                    <p className="font-medium mb-1">油价推送功能：</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                      <li>在油价调整日当天8:30推送趋势预测</li>
                      <li>在油价调整日次日推送油价变化信息</li>
                      <li>推荐配置 52api 获取准确油价数据</li>
                      <li>不配置则使用AI搜索获取油价信息</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 消息提示 */}
              {message && (
                <div
                  className={`flex items-center gap-2 rounded-lg p-3 ${
                    message.type === "success"
                      ? "bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100"
                      : "bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100"
                  }`}
                >
                  {message.type === "success" ? (
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="text-sm">{message.text}</span>
                </div>
              )}

              <div className="flex gap-2">
                {isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="flex-1"
                  >
                    取消
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={isSaving}
                  className={isEditing ? "flex-1" : "w-full"}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      测试连接中...
                    </>
                  ) : isEditing ? (
                    "更新配置"
                  ) : (
                    "保存配置"
                  )}
                </Button>
              </div>

              {/* 导出/导入配置按钮 */}
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">快速导入已有配置：</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleExportConfig}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    导出配置
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleImportConfig}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    导入配置
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
      </CardContent>
    </Card>
  )
}
