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
import { Loader2, CheckCircle, XCircle, Info } from "lucide-react"

const webdavConfigSchema = z.object({
  url: z.string().min(1, "WebDAV 地址不能为空").url("请输入有效的 URL"),
  username: z.string().min(1, "用户名不能为空"),
  password: z.string().min(1, "密码不能为空"),
  pushplusToken: z.string().optional(),
})

type WebDAVConfigForm = z.infer<typeof webdavConfigSchema>

export default function WebDAVConfig() {
  const [isConfigured, setIsConfigured] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [configUrl, setConfigUrl] = useState("")

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
      const response = await fetch("/api/webdav/config")
      const result = await response.json()
      if (result.success && result.configured) {
        setIsConfigured(true)
        setConfigUrl(result.config.url)
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
        setMessage({ type: "success", text: "配置保存成功！" })
        setIsConfigured(true)
        setConfigUrl(data.url)
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
        setIsConfigured(false)
        setConfigUrl("")
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

  if (isConfigured) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>WebDAV 已配置</CardTitle>
              <CardDescription>
                已连接到: {configUrl}
              </CardDescription>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleClearConfig}>
            清除配置
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>配置 WebDAV</CardTitle>
        <CardDescription>
          配置 WebDAV 服务以存储优惠券数据
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

              <Button type="submit" disabled={isSaving} className="w-full">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    测试连接中...
                  </>
                ) : (
                  "保存配置"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </CardContent>
    </Card>
  )
}
