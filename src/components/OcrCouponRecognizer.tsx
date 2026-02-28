"use client"

import { useState, useRef } from "react"
import { Upload, X, Loader2, ScanText, Check, AlertCircle, FileText, Image as ImageIcon, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface OcrResult {
  text: string
  confidence: number
}

export interface ExtractedCouponInfo {
  title?: string
  discountAmount?: number
  discountType?: 'amount' | 'percentage' | 'full'
  fullAmount?: number
  endDate?: string
  endHour?: number
  endMinute?: number
  storeName?: string
  description?: string
  notes?: string
}

interface OcrCouponRecognizerProps {
  onExtracted: (info: ExtractedCouponInfo) => void
  onCancel?: () => void
}

// 辅助函数：计算剩余天数（北京时间UTC+8）
function getDaysRemaining(endDate: string): number {
  let year: number, month: number, day: number

  // 处理不同的日期格式
  if (endDate.includes('T') && endDate.endsWith('Z')) {
    // 带Z后缀，表示UTC时间，直接解析并转换为北京时间
    const utcDate = new Date(endDate)
    year = utcDate.getUTCFullYear()
    month = utcDate.getUTCMonth() + 1
    day = utcDate.getUTCDate()
  } else if (endDate.includes('T')) {
    // 带T但不带Z，假设为本地时间（北京时间），手动解析
    const [datePart] = endDate.split('T')
    const dateComponents = datePart.split('-').map(Number)
    year = dateComponents[0]
    month = dateComponents[1]
    day = dateComponents[2]
  } else {
    // 纯日期格式（如 2026-02-23），假设为北京时间
    const dateComponents = endDate.split('-').map(Number)
    year = dateComponents[0]
    month = dateComponents[1]
    day = dateComponents[2]
  }

  // 创建北京时间日期对象（手动设置年月日，避免时区转换）
  const couponExpiryDate = new Date()
  couponExpiryDate.setFullYear(year, month - 1, day)
  couponExpiryDate.setHours(23, 59, 59, 999)

  // 当前北京时间（UTC+8）
  const now = new Date()
  const utcNow = now.getTime() + (now.getTimezoneOffset() * 60000)
  const beijingNow = new Date(utcNow + (8 * 3600000))

  // 计算剩余天数
  const diffTime = couponExpiryDate.getTime() - beijingNow.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

// 辅助函数：格式化到期时间
function formatExpiryDate(endDate: string): string {
  let year: number, month: number, day: number

  // 处理不同的日期格式
  if (endDate.includes('T') && endDate.endsWith('Z')) {
    const utcDate = new Date(endDate)
    year = utcDate.getUTCFullYear()
    month = utcDate.getUTCMonth() + 1
    day = utcDate.getUTCDate()
  } else if (endDate.includes('T')) {
    const [datePart] = endDate.split('T')
    const dateComponents = datePart.split('-').map(Number)
    year = dateComponents[0]
    month = dateComponents[1]
    day = dateComponents[2]
  } else {
    const dateComponents = endDate.split('-').map(Number)
    year = dateComponents[0]
    month = dateComponents[1]
    day = dateComponents[2]
  }

  const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  const timeStr = `23:59`

  return `${dateStr} ${timeStr}`
}

// 辅助函数：获取到期时间颜色
function getExpiryColor(endDate: string): string {
  const days = getDaysRemaining(endDate)
  if (days <= 1) return 'text-red-600 dark:text-red-400'
  if (days <= 7) return 'text-orange-600 dark:text-orange-400'
  return 'text-green-600 dark:text-green-400'
}

// 辅助函数：获取折扣类型标签
function getDiscountTypeLabel(type?: string): string {
  switch (type) {
    case 'full': return '满减'
    case 'percentage': return '折扣'
    case 'amount': return '减免'
    default: return '优惠'
  }
}

// 辅助函数：获取折扣类型badge样式
function getCouponTypeBadge(type?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (type) {
    case 'full': return 'destructive'
    case 'percentage': return 'default'
    case 'amount': return 'secondary'
    default: return 'outline'
  }
}

export default function OcrCouponRecognizer({ onExtracted, onCancel }: OcrCouponRecognizerProps) {
  const [mode, setMode] = useState<'ocr' | 'ai' | 'text'>('ai') // 'ocr' 或 'ai' 或 'text'
  // 默认使用GLM-4，避免豆包AI的地区限制问题
  const [aiModel, setAiModel] = useState<'doubao' | 'glm'>('glm')
  const [image, setImage] = useState<string | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [aiResult, setAiResult] = useState<any>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractedInfo, setExtractedInfo] = useState<ExtractedCouponInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pastedText, setPastedText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (file: File) => {
    setError(null)
    setOcrResult(null)
    setExtractedInfo(null)

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return
    }

    // 验证文件大小（限制为10MB）
    if (file.size > 10 * 1024 * 1024) {
      setError('图片大小不能超过10MB')
      return
    }

    // 读取图片并预览
    const reader = new FileReader()
    reader.onload = (e) => {
      setImage(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const recognizeImage = async () => {
    if (!image) return

    setIsRecognizing(true)
    setProgress(0)
    setError(null)

    try {
      // 动态导入Tesseract.js（减小初始包体积）
      const Tesseract = (await import('tesseract.js')).default

      const result = await Tesseract.recognize(
        image,
        'chi_sim+eng', // 简体中文 + 英文
        {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round(m.progress * 100))
            }
          },
        }
      )

      setOcrResult({
        text: result.data.text,
        confidence: result.data.confidence,
      })
    } catch (err) {
      console.error('OCR识别失败:', err)
      setError('OCR识别失败，请重试')
    } finally {
      setIsRecognizing(false)
    }
  }

  const recognizeWithAI = async () => {
    if (!image) return

    setIsRecognizing(true)
    setProgress(0)
    setError(null)
    setAiResult(null)

    try {
      // 将data URL转换为Blob
      const response = await fetch(image)
      const blob = await response.blob()

      // 创建FormData
      const formData = new FormData()
      formData.append('image', blob)
      formData.append('aiModel', aiModel)

      // 调用API
      const apiResponse = await fetch('/api/parse-coupon-image', {
        method: 'POST',
        body: formData,
      })

      const result = await apiResponse.json()

      if (result.success) {
        setAiResult(result.data)
        console.log('AI识别结果:', result.data)

        // 如果识别到优惠券，自动填充第一张
        if (result.data.coupons && result.data.coupons.length > 0) {
          const firstCoupon = result.data.coupons[0]
          const extractedInfo: ExtractedCouponInfo = {
            storeName: firstCoupon.storeName,
            title: firstCoupon.title,
            description: `${firstCoupon.condition} ${firstCoupon.endDate}`,
            notes: `AI识别: ${aiModel}`,
          }

          // 尝试解析优惠条件
          if (firstCoupon.condition.includes('满')) {
            const match = firstCoupon.condition.match(/满(\d+(?:\.\d+)?)减(\d+(?:\.\d+)?)/)
            if (match) {
              extractedInfo.discountType = 'full'
              extractedInfo.fullAmount = parseFloat(match[1])
              extractedInfo.discountAmount = parseFloat(match[2])
            }
          } else if (firstCoupon.condition.includes('无门槛')) {
            // 无门槛，尝试从标题中提取金额
            const amountMatch = firstCoupon.title.match(/(\d+(?:\.\d+)?)元/)
            if (amountMatch) {
              extractedInfo.discountType = 'amount'
              extractedInfo.discountAmount = parseFloat(amountMatch[1])
            }
          }

          // 尝试解析到期时间
          if (firstCoupon.endDate) {
            const dateMatch = firstCoupon.endDate.match(/(\d{4})年(\d+)月(\d+)日(?:\s+(\d+):(\d+))?/)
            if (dateMatch) {
              const year = parseInt(dateMatch[1])
              const month = parseInt(dateMatch[2])
              const day = parseInt(dateMatch[3])
              extractedInfo.endDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`

              if (dateMatch[4]) {
                extractedInfo.endHour = parseInt(dateMatch[4])
                extractedInfo.endMinute = parseInt(dateMatch[5])
              }
            }
          }

          setExtractedInfo(extractedInfo)
          onExtracted(extractedInfo)
        }
      } else {
        // 检查是否是地区限制错误
        if (result.details?.errorType === 'region_restriction') {
          setError(result.error || 'AI识别失败')
          // 可以在这里显示特殊的UI提示
        } else {
          setError(result.error || 'AI识别失败')
        }
      }
    } catch (err: any) {
      console.error('AI识别失败:', err)
      // 检查是否是地区限制错误
      if (err?.code === 'unsupported_country_region_territory' || err?.status === 403) {
        setError('豆包AI不支持当前地区访问。请使用GLM-4模型。在Vercel环境变量中配置 GLM_API_KEY。')
      } else {
        setError('AI识别失败，请重试')
      }
    } finally {
      setIsRecognizing(false)
    }
  }

  const extractCouponInfo = async () => {
    if (!ocrResult?.text) return

    setIsExtracting(true)
    setError(null)

    try {
      const response = await fetch('/api/parse-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrResult.text }),
      })

      const result = await response.json()

      if (result.success) {
        setExtractedInfo(result.data)
        // 自动填充到表单
        onExtracted(result.data)
      } else {
        setError(result.error || '解析失败')
      }
    } catch (err) {
      console.error('解析失败:', err)
      setError('解析失败，请重试')
    } finally {
      setIsExtracting(false)
    }
  }

  const clearImage = () => {
    setImage(null)
    setOcrResult(null)
    setAiResult(null)
    setExtractedInfo(null)
    setError(null)
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleParseText = async () => {
    if (!pastedText.trim()) return

    setIsExtracting(true)
    setError(null)

    try {
      const response = await fetch('/api/parse-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText }),
      })

      const result = await response.json()

      if (result.success) {
        setExtractedInfo(result.data)
        // 自动填充到表单
        onExtracted(result.data)
      } else {
        setError(result.error || '解析失败')
      }
    } catch (err) {
      console.error('解析失败:', err)
      setError('解析失败，请重试')
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScanText className="h-5 w-5" />
              OCR 识别优惠券
            </CardTitle>
            <CardDescription>
              上传截图或粘贴文本，自动识别优惠信息
            </CardDescription>
          </div>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* 模式切换 */}
        <Tabs value={mode} onValueChange={(value) => setMode(value as 'ocr' | 'ai' | 'text')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ocr" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              OCR识别
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="h-4 w-4" />
              AI视觉识别
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-2">
              <FileText className="h-4 w-4" />
              文本粘贴
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 错误提示 */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs value={mode} onValueChange={(value) => setMode(value as 'ocr' | 'ai' | 'text')} className="w-full">
          {/* OCR识别模式 */}
          <TabsContent value="ocr" className="space-y-4 mt-0">
            {!image ? (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={handleImageClick}
              >
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  拖拽图片到此处，或点击选择
                </p>
                <p className="text-xs text-muted-foreground">
                  支持 JPG、PNG、WEBP 格式，最大10MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* 图片预览 */}
                <div className="relative">
                  <img
                    src={image}
                    alt="优惠券截图"
                    className="w-full rounded-lg border"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearImage()
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* 识别进度 */}
                {isRecognizing && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在识别图片... {progress}%
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 识别结果 */}
                {ocrResult && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">识别结果：</span>
                      <span className="text-xs text-muted-foreground">
                        置信度: {ocrResult.confidence.toFixed(1)}%
                      </span>
                    </div>
                    <Textarea
                      value={ocrResult.text}
                      onChange={(e) => setOcrResult({ ...ocrResult, text: e.target.value })}
                      placeholder="识别的文本将显示在这里"
                      rows={6}
                      className="text-sm"
                    />
                    <Button
                      onClick={extractCouponInfo}
                      disabled={isExtracting || !ocrResult.text.trim()}
                      className="w-full gap-2"
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          解析中...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          提取优惠信息
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* 操作按钮 */}
                {!ocrResult && !isRecognizing && (
                  <Button onClick={recognizeImage} className="w-full gap-2">
                    <ScanText className="h-4 w-4" />
                    开始识别
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          {/* AI智能识别模式 */}
          <TabsContent value="ai" className="space-y-4 mt-0">
            <div className="space-y-4">
              {/* AI模型选择 */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={aiModel === 'doubao' ? 'default' : 'outline'}
                  onClick={() => setAiModel('doubao')}
                  className="flex-1"
                >
                  🌱 豆包AI
                </Button>
                <Button
                  type="button"
                  variant={aiModel === 'glm' ? 'default' : 'outline'}
                  onClick={() => setAiModel('glm')}
                  className="flex-1"
                >
                  🧠 GLM-4
                </Button>
              </div>

              {/* 上传图片 */}
              {!image ? (
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={handleImageClick}
                >
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-2">
                    拖拽优惠券截图到此处，或点击选择
                  </p>
                  <p className="text-xs text-muted-foreground">
                    AI将自动识别商家、优惠名称、优惠条件和到期时间
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 图片预览 */}
                  <div className="relative">
                    <img
                      src={image}
                      alt="优惠券截图"
                      className="w-full rounded-lg border"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={clearImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* AI提示信息 */}
                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                    <p className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      {aiModel === 'doubao' ? '豆包AI' : 'GLM-4'}将智能识别优惠券信息
                    </p>
                  </div>

                  {/* 识别结果 */}
                  {aiResult && aiResult.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">识别结果：</div>
                      <div className="space-y-2">
                        {aiResult.map((coupon: any, index: number) => (
                          <div
                            key={index}
                            className="border rounded-lg p-3 bg-muted/50"
                          >
                            <div className="space-y-1">
                              <div className="flex justify-between items-start">
                                <span className="font-medium">{coupon.merchant}</span>
                                <Badge variant={getCouponTypeBadge(coupon.discountType)}>
                                  {getDiscountTypeLabel(coupon.discountType)}
                                </Badge>
                              </div>
                              <div className="text-sm">{coupon.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {coupon.conditions}
                              </div>
                              <div className="flex justify-between items-center">
                                <span className={`text-xs font-medium ${getExpiryColor(coupon.expiryDate)}`}>
                                  {formatExpiryDate(coupon.expiryDate)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  剩余 {getDaysRemaining(coupon.expiryDate)} 天
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {error && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>识别失败</AlertTitle>
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {/* 操作按钮 */}
                  {!aiResult && !isRecognizing && (
                    <Button onClick={recognizeWithAI} className="w-full gap-2">
                      <Sparkles className="h-4 w-4" />
                      开始AI识别
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* 文本粘贴模式 */}
          <TabsContent value="text" className="space-y-4 mt-0">
            <div className="space-y-3">
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="粘贴优惠券的文本信息，例如：&#10;淘宝优惠券&#10;满100减20元&#10;有效期至2024-12-31 23点"
                rows={8}
                className="text-sm"
              />
              <Button
                onClick={handleParseText}
                disabled={isExtracting || !pastedText.trim()}
                className="w-full gap-2"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    解析中...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    提取优惠信息
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
