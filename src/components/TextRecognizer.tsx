"use client"

import { useState } from "react"
import { Loader2, ScanText, Check, AlertCircle, FileJson } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
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
}

interface TextRecognizerProps {
  onExtracted: (coupons: PreviewCoupon[]) => void
  onCancel?: () => void
  batchMode?: boolean
}

export default function TextRecognizer({ onExtracted, onCancel, batchMode = false }: TextRecognizerProps) {
  const [inputText, setInputText] = useState("")
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
      // 尝试分割多个优惠券文本
      const couponTexts = splitCouponTexts(inputText)

      const extractedInfos: ExtractedCouponInfo[] = []

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
              useAI: true,
              aiModel: 'glm', // 默认使用GLM，后端会自动回退
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || "识别失败")
          }

          const data = await response.json()
          extractedInfos.push({
            ...data,
            originalText: couponText,
          })
        } catch (err) {
          console.error(`识别第${i + 1}个优惠券失败:`, err)
          // 单个优惠券识别失败时，使用规则匹配作为兜底
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
              const data = await response.json()
              extractedInfos.push({
                ...data,
                originalText: couponText,
              })
            }
          } catch (fallbackErr) {
            console.error(`规则匹配也失败:`, fallbackErr)
          }
        }
      }

      if (extractedInfos.length === 0) {
        setError("无法识别优惠券信息，请检查输入文本格式")
        setIsProcessing(false)
        return
      }

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
      }))

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanText className="h-5 w-5" />
            文本智能识别
          </CardTitle>
          <CardDescription>
            输入优惠券文本，AI会自动提取标题、折扣、到期时间等信息
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium mb-1">识别说明：</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>AI识别会自动尝试GLM、豆包和规则匹配三种方式</li>
              <li>支持满减、折扣、立减等多种优惠类型</li>
              <li>支持"7天后"、"本周三"、"1月15日"等多种日期格式</li>
              <li>识别后会显示预览，您可以手动调整后确认添加</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {showPreviewDialog && (
        <CouponPreviewDialog
          coupons={previewCoupons}
          open={showPreviewDialog}
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
