"use client"

import { useState } from "react"
import { Loader2, Send, Code, FileText, Settings2, Sparkles, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"

interface ExtractedCouponInfo {
  title?: string
  description?: string
  discountAmount?: number
  discountType?: 'amount' | 'percentage' | 'full'
  fullAmount?: number
  startDate?: string
  endDate?: string
  endHour?: number
  endMinute?: number
  notes?: string
  storeName?: string
  aiModel?: 'glm' | 'doubao' | 'rule'
  rawResponse?: string
}

export default function TestAIPage() {
  const [inputText, setInputText] = useState("")
  const [aiModel, setAiModel] = useState<'glm' | 'doubao' | 'rule'>('doubao')
  const [useFallback, setUseFallback] = useState(true)
  const [smartBatch, setSmartBatch] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  const sampleTexts = [
    {
      name: "单张优惠券",
      text: "瑞幸咖啡 26元C1饮品通用 2026年2月25日到期"
    },
    {
      name: "满减优惠券",
      text: "建设银行立减金 满2000减5 2026年2月23日23:59失效"
    },
    {
      name: "折扣券",
      text: "星巴克 8折优惠券 2026年3月5日过期"
    },
    {
      name: "多张优惠券",
      text: `瑞幸咖啡 26元C1饮品通用 2026年2月25日到期
肯德基 汉堡套餐 满50减10 2026年3月1日过期
建设银行立减金 满2000减5 2026年2月23日23:59失效
星巴克 8折优惠券 2026年3月5日过期`
    },
    {
      name: "无门槛券",
      text: "蜜雪冰城 10元无门槛饮品券 2026年3月10日23:59过期"
    }
  ]

  const handleTest = async () => {
    if (!inputText.trim()) {
      setError("请输入测试文本")
      return
    }

    setIsProcessing(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/parse-coupon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: inputText,
          useAI: aiModel !== 'rule',
          aiModel: aiModel,
          smartBatch: smartBatch,
          useFallback: useFallback,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "API请求失败")
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "测试失败")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const renderCoupon = (coupon: ExtractedCouponInfo, index: number) => (
    <Card key={index} className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">优惠券 #{index + 1}</CardTitle>
          {coupon.aiModel && (
            <Badge variant="secondary">
              {coupon.aiModel === 'glm' && 'GLM'}
              {coupon.aiModel === 'doubao' && '豆包'}
              {coupon.aiModel === 'rule' && '规则'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div><strong>标题：</strong>{coupon.title || '未提取'}</div>
          <div><strong>店铺：</strong>{coupon.storeName || '未提取'}</div>
          <div>
            <strong>优惠：</strong>
            {coupon.discountType === 'full' && `满${coupon.fullAmount}减${coupon.discountAmount}`}
            {coupon.discountType === 'percentage' && `${coupon.discountAmount}折`}
            {coupon.discountType === 'amount' && `${coupon.discountAmount}元`}
            {!coupon.discountType && '未提取'}
          </div>
          <div><strong>截止时间：</strong>{coupon.endDate || '未提取'}</div>
          {coupon.endHour && <div><strong>截止小时：</strong>{coupon.endHour}点</div>}
          <div><strong>描述：</strong>{coupon.description || '-'}</div>
          {coupon.notes && <div><strong>备注：</strong>{coupon.notes}</div>}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-purple-600" />
            AI 模型测试工具
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            测试不同AI模型的优惠券识别能力
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 左侧：输入和设置 */}
          <div className="space-y-6">
            {/* 设置卡片 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5" />
                  模型设置
                </CardTitle>
                <CardDescription>选择AI模型和配置</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">AI 模型</label>
                  <Select value={aiModel} onValueChange={(value: any) => setAiModel(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="doubao">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          豆包 AI (doubao-seed-1-8-251228)
                        </div>
                      </SelectItem>
                      <SelectItem value="glm">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          GLM-4.7-Flash
                        </div>
                      </SelectItem>
                      <SelectItem value="rule">
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4" />
                          规则匹配（无AI）
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">智能批量抽取</label>
                  <Switch checked={smartBatch} onCheckedChange={setSmartBatch} />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">自动回退（AI失败时使用规则匹配）</label>
                  <Switch checked={useFallback} onCheckedChange={setUseFallback} />
                </div>
              </CardContent>
            </Card>

            {/* 输入卡片 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  输入文本
                </CardTitle>
                <CardDescription>输入要测试的优惠券文本</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="输入优惠券文本..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={6}
                  className="font-mono"
                />

                {/* 示例文本 */}
                <div>
                  <label className="text-sm font-medium mb-2 block">快速填充示例：</label>
                  <div className="flex flex-wrap gap-2">
                    {sampleTexts.map((sample) => (
                      <Button
                        key={sample.name}
                        variant="outline"
                        size="sm"
                        onClick={() => setInputText(sample.text)}
                      >
                        {sample.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 测试按钮 */}
                <Button
                  onClick={handleTest}
                  disabled={isProcessing || !inputText.trim()}
                  className="w-full"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      测试中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      开始测试
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：结果展示 */}
          <div className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>识别结果</CardTitle>
                    <Badge variant={result.success ? "default" : "destructive"}>
                      {result.success ? "成功" : "失败"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="formatted">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="formatted">格式化展示</TabsTrigger>
                      <TabsTrigger value="json">原始 JSON</TabsTrigger>
                    </TabsList>

                    <TabsContent value="formatted" className="mt-4">
                      {Array.isArray(result.data) ? (
                        <div>
                          <div className="mb-4 text-sm text-gray-600">
                            共识别到 {result.data.length} 张优惠券
                          </div>
                          {result.data.map((coupon: ExtractedCouponInfo, index: number) =>
                            renderCoupon(coupon, index)
                          )}
                        </div>
                      ) : (
                        renderCoupon(result.data, 1)
                      )}
                    </TabsContent>

                    <TabsContent value="json" className="mt-4">
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={() => handleCopy(JSON.stringify(result, null, 2))}
                        >
                          {copied ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs">
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* 使用说明 */}
            <Card>
              <CardHeader>
                <CardTitle>使用说明</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div><strong>豆包 AI：</strong>适合大多数场景，识别准确度高</div>
                <div><strong>GLM-4.7-Flash：</strong>需要配置API Key，适合复杂场景</div>
                <div><strong>规则匹配：</strong>不使用AI，基于正则表达式匹配</div>
                <div><strong>智能批量抽取：</strong>自动识别多张优惠券（需要AI）</div>
                <div><strong>自动回退：</strong>AI失败时自动使用规则匹配</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
