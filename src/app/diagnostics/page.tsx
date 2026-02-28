"use client"

import { useState } from "react"
import { CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface DiagnosticItem {
  name: string
  status: 'pending' | 'success' | 'error'
  message?: string
  details?: any
}

export default function DiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const runDiagnostics = async () => {
    setIsLoading(true)
    const results: DiagnosticItem[] = []

    // 测试1：基本环境检查
    try {
      const response = await fetch('/api/diagnostics')
      const data = await response.json()

      results.push({
        name: '环境检查',
        status: 'success',
        message: '环境正常',
        details: data
      })

      // 检查环境变量
      if (data.envVars.GLM_API_KEY === '未配置') {
        results.push({
          name: 'GLM API Key',
          status: 'error',
          message: '未配置GLM_API_KEY，无法使用GLM-4模型',
          details: '豆包AI可以使用，不受影响'
        })
      } else {
        results.push({
          name: 'GLM API Key',
          status: 'success',
          message: '已配置'
        })
      }
    } catch (error) {
      results.push({
        name: '环境检查',
        status: 'error',
        message: error instanceof Error ? error.message : '未知错误'
      })
    }

    // 测试2：图片上传测试
    try {
      const testImage = new Blob(['test'], { type: 'image/jpeg' })
      const formData = new FormData()
      formData.append('image', testImage, 'test.jpg')

      const response = await fetch('/api/diagnostics', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        results.push({
          name: '图片上传',
          status: 'success',
          message: '图片上传功能正常'
        })
      } else {
        throw new Error('上传失败')
      }
    } catch (error) {
      results.push({
        name: '图片上传',
        status: 'error',
        message: error instanceof Error ? error.message : '未知错误'
      })
    }

    // 测试3：SDK检查
    try {
      const response = await fetch('/api/diagnostics')
      const data = await response.json()

      if (data.sdkTest.clientCreated) {
        results.push({
          name: 'coze-coding-dev-sdk',
          status: 'success',
          message: 'SDK正常工作',
          details: data.sdkTest
        })
      } else {
        throw new Error('SDK未正确初始化')
      }
    } catch (error) {
      results.push({
        name: 'coze-coding-dev-sdk',
        status: 'error',
        message: error instanceof Error ? error.message : '未知错误'
      })
    }

    setDiagnostics(results)
    setIsLoading(false)
  }

  const getStatusIcon = (status: DiagnosticItem['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'pending':
        return <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            部署诊断工具
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            检查Vercel部署的配置和环境
          </p>
        </div>

        <div className="space-y-6">
          {/* 操作按钮 */}
          <Card>
            <CardHeader>
              <CardTitle>运行诊断</CardTitle>
              <CardDescription>
                点击下方按钮开始系统检查
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={runDiagnostics}
                disabled={isLoading}
                size="lg"
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    诊断中...
                  </>
                ) : (
                  '开始诊断'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* 诊断结果 */}
          {diagnostics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>诊断结果</CardTitle>
                <CardDescription>
                  检查结果概览
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {diagnostics.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-4 rounded-lg border bg-card"
                    >
                      <div className="mt-0.5">
                        {getStatusIcon(item.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-semibold">{item.name}</h3>
                          <span className={`text-sm ${
                            item.status === 'success' ? 'text-green-600' :
                            item.status === 'error' ? 'text-red-600' :
                            'text-gray-400'
                          }`}>
                            {item.status === 'success' && '正常'}
                            {item.status === 'error' && '异常'}
                            {item.status === 'pending' && '检查中...'}
                          </span>
                        </div>
                        {item.message && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {item.message}
                          </p>
                        )}
                        {item.details && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                              查看详情
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto">
                              {JSON.stringify(item.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vercel部署说明 */}
          <Card>
            <CardHeader>
              <CardTitle>Vercel部署注意事项</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <strong>超时限制</strong>
                    <p className="text-gray-600 dark:text-gray-400">
                      免费版：10秒，适合小图片（&lt;1MB）。Pro版：60秒，适合大图片。
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <strong>环境变量</strong>
                    <p className="text-gray-600 dark:text-gray-400">
                      豆包AI无需额外配置。GLM-4需要配置GLM_API_KEY。
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <strong>图片大小</strong>
                    <p className="text-gray-600 dark:text-gray-400">
                      推荐上传小于2MB的图片，格式：JPG、PNG、WEBP。
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 故障排查指南 */}
          <Card>
            <CardHeader>
              <CardTitle>故障排查指南</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>图片识别超时：</strong>压缩图片或升级到Vercel Pro版
                  </AlertDescription>
                </Alert>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>API返回404：</strong>等待部署完成或重新部署
                  </AlertDescription>
                </Alert>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>GLM无法使用：</strong>在Vercel环境变量中配置GLM_API_KEY
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
