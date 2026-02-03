"use client"

import { useState } from "react"
import { Loader2, ScanText, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import CouponPreviewDialog, { type PreviewCoupon } from "@/components/CouponPreviewDialog"

export interface ExtractedCouponInfo {
  title?: string
  discountAmount?: number
  discountAmountUnit?: string
  discountType?: 'amount' | 'percentage' | 'full'
  fullAmount?: number
  endDate?: string
  endHour?: number
  endMinute?: number
  storeName?: string
  description?: string
  notes?: string
  originalText?: string
  aiModel?: 'glm' | 'doubao' | 'rule' // 使用的AI模型
  rawResponse?: string // AI模型的原始返回值
}

interface TextRecognizerProps {
  onExtracted: (coupons: PreviewCoupon[]) => void
  onCancel?: () => void
  batchMode?: boolean
}

export default function TextRecognizer({ onExtracted, onCancel, batchMode = false }: TextRecognizerProps) {
  const [inputText, setInputText] = useState("")
  const [aiModel, setAiModel] = useState<'glm' | 'doubao' | 'rule'>('doubao') // 默认使用豆包
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewCoupons, setPreviewCoupons] = useState<PreviewCoupon[]>([])
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)

  const handleRecognize = async () => {
    if (!inputText.trim()) {
      setError("请输入识别文本")
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      let extractedInfos: ExtractedCouponInfo[] = []

      // 判断是否为多行文本
      const lines = inputText.split('\n').map(line => line.trim()).filter(line => line)
      const isMultiLine = lines.length > 1

      console.log('=== 识别调试信息 ===')
      console.log('输入文本:', inputText)
      console.log('行数:', lines.length)
      console.log('isMultiLine:', isMultiLine)
      console.log('aiModel:', aiModel)

      // 智能批量抽取模式（多行文本且使用AI）
      if (isMultiLine && aiModel !== 'rule') {
        console.log('进入智能批量抽取模式')
        try {
          const response = await fetch("/api/parse-coupon", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: inputText,
              useAI: true,
              aiModel: aiModel, // 支持豆包和GLM
              smartBatch: true, // 自动启用智能批量抽取
              useFallback: false,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || "智能批量识别失败")
          }

          const result = await response.json()
          console.log('批量识别结果:', result)
          if (result.success && result.data) {
            // 智能批量返回的是数组
            if (Array.isArray(result.data)) {
              extractedInfos = result.data
              console.log('批量识别成功，数量:', extractedInfos.length)
            } else {
              // 如果返回单个对象，包装成数组
              extractedInfos = [result.data]
              console.log('批量识别返回单个对象')
            }
          } else {
            throw new Error(result.error || "识别失败")
          }
        } catch (batchErr) {
          console.error('智能批量抽取失败，回退到按行识别:', batchErr)
          // 回退到按行识别
        }
      } else {
        console.log('未进入批量识别模式')
        console.log('isMultiLine:', isMultiLine, 'aiModel:', aiModel)
      }

      // 如果智能批量失败或未启用，使用按行识别
      if (extractedInfos.length === 0) {
        // 尝试分割多个优惠券文本
        const couponTexts = splitCouponTexts(inputText)

        for (let i = 0; i < couponTexts.length; i++) {
          const couponText = couponTexts[i]

          try {
            const response = await fetch("/api/parse-coupon", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text: couponText,
                useAI: aiModel !== 'rule',
                aiModel: aiModel !== 'rule' ? aiModel : undefined,
                useFallback: false, // 不使用自动回退
              }),
            })

            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.error || "识别失败")
            }

            const result = await response.json()
            if (result.success && result.data) {
              extractedInfos.push({
                ...result.data,
                originalText: couponText,
              })
            } else {
              throw new Error(result.error || "识别失败")
            }
          } catch (err) {
            console.error(`识别第${i + 1}个优惠券失败:`, err)
            // 单个优惠券识别失败时，如果是规则匹配，则跳过
            // 否则尝试规则匹配作为兜底
            if (aiModel !== 'rule') {
              console.log(`尝试规则匹配作为兜底`)
              try {
                const response = await fetch("/api/parse-coupon", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    text: couponText,
                    useAI: false,
                  }),
                })

                if (response.ok) {
                  const result = await response.json()
                  if (result.success && result.data) {
                    console.log(`规则匹配成功，但会覆盖aiModel为'rule'`)
                    extractedInfos.push({
                      ...result.data,
                      originalText: couponText,
                    })
                  }
                }
              } catch (fallbackErr) {
                console.error(`规则匹配也失败:`, fallbackErr)
              }
            }
          }
        }
      }

      if (extractedInfos.length === 0) {
        setError("无法识别优惠券信息，请检查输入文本格式")
        setIsProcessing(false)
        return
      }

      console.log('=== 转换前的数据 ===')
      console.log('extractedInfos数量:', extractedInfos.length)
      extractedInfos.forEach((info, index) => {
        console.log(`[${index}] aiModel: ${info.aiModel}, storeName: ${info.storeName}`)
      })

      // 转换为预览格式
      const previewData = extractedInfos.map((info, index) => ({
        id: `preview-${Date.now()}-${index}`,
        title: info.title || `优惠券 ${index + 1}`,
        discountAmount: info.discountAmount || 0,
        discountType: info.discountType || 'amount',
        fullAmount: info.fullAmount,
        endDate: info.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        endHour: info.endHour,
        endMinute: info.endMinute,
        storeName: info.storeName || '',
        description: info.description || '',
        notes: info.notes || '',
        originalText: info.originalText,
        aiModel: info.aiModel,
        rawResponse: info.rawResponse,
      }))

      console.log('=== 转换后的预览数据 ===')
      console.log('previewData数量:', previewData.length)
      previewData.forEach((info, index) => {
        console.log(`[${index}] aiModel: ${info.aiModel}, storeName: ${info.storeName}`)
      })

      setPreviewCoupons(previewData)
      setShowPreviewDialog(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "识别失败，请重试")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirm = (coupons: PreviewCoupon[]) => {
    onExtracted(coupons)
    setShowPreviewDialog(false)
    setInputText("")
    setPreviewCoupons([])
  }

  const handleCancelPreview = () => {
    setShowPreviewDialog(false)
    setPreviewCoupons([])
    setError(null)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ScanText className="h-5 w-5" />
          <h2 className="text-lg font-semibold">文本智能识别</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          输入优惠券文本，AI会自动提取标题、折扣、到期时间等信息
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium">识别文本</label>
          <Textarea
            placeholder="请输入优惠券文本，支持多行输入&#10;例如：&#10;满100减20，7天后23点到期&#10;8.5折券，本月31日失效&#10;立减10元，下周三过期"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[120px]"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleRecognize}
            disabled={isProcessing || !inputText.trim()}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                识别中...
              </>
            ) : (
              <>
                <ScanText className="mr-2 h-4 w-4" />
                开始识别
              </>
            )}
          </Button>
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isProcessing}
            >
              取消
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">识别方式</label>
          <Select value={aiModel} onValueChange={(value: 'glm' | 'doubao' | 'rule') => setAiModel(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="glm">GLM-4.7-Flash（推荐）</SelectItem>
              <SelectItem value="doubao">豆包AI</SelectItem>
              <SelectItem value="rule">规则匹配</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium mb-1">识别说明：</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>GLM-4.7-Flash：智谱AI模型，识别准确度高</li>
            <li>豆包AI：字节跳动AI模型，响应速度快</li>
            <li>规则匹配：不依赖AI，基于固定规则提取</li>
            <li>智能批量：多行文本自动批量识别，无需手动拆分</li>
            <li>识别后显示预览，可手动调整后添加</li>
          </ul>
        </div>
      </div>

      {showPreviewDialog && (
        <CouponPreviewDialog
          isOpen={showPreviewDialog}
          coupons={previewCoupons}
          onConfirm={handleConfirm}
          onCancel={handleCancelPreview}
        />
      )}
    </div>
  )
}

/**
 * 尝试分割多个优惠券文本
 */
function splitCouponTexts(text: string): string[] {
  // 去除首尾空白
  const trimmed = text.trim()

  // 如果文本很短，直接作为一个优惠券
  if (trimmed.length < 30) {
    return [trimmed]
  }

  // 按行分割
  const lines = trimmed.split('\n').map(line => line.trim()).filter(line => line.length > 0)

  // 如果只有一行，直接作为一个优惠券
  if (lines.length === 1) {
    return [trimmed]
  }

  // 尝试判断是否每个都是一个优惠券
  const coupons: string[] = []
  let currentCoupon = ''

  for (const line of lines) {
    // 如果这行看起来像优惠券的开始（包含常见的优惠券关键词），且当前优惠券不为空
    if (
      currentCoupon &&
      (
        line.includes('满') ||
        line.includes('减') ||
        line.includes('折') ||
        line.includes('立减') ||
        line.includes('到') ||
        line.includes('有效期')
      ) &&
      !currentCoupon.includes('到期')
    ) {
      coupons.push(currentCoupon.trim())
      currentCoupon = line
    } else {
      currentCoupon += (currentCoupon ? '\n' : '') + line
    }
  }

  if (currentCoupon) {
    coupons.push(currentCoupon.trim())
  }

  // 如果分割后只有一个，返回原始文本
  if (coupons.length === 1) {
    return [trimmed]
  }

  return coupons
}
