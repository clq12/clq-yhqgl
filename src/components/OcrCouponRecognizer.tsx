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
  startDate?: string
  endDate?: string
  endHour?: number
  endMinute?: number
  storeName?: string
  description?: string
  notes?: string
}

interface OcrCouponRecognizerProps {
  onExtracted?: (info: ExtractedCouponInfo) => void
  onDirectAdd?: (coupons: ExtractedCouponInfo[]) => Promise<void>
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

export default function OcrCouponRecognizer({ onExtracted, onDirectAdd, onCancel }: OcrCouponRecognizerProps) {
  const [mode, setMode] = useState<'ocr' | 'ai' | 'text'>('ai') // 'ocr' 或 'ai' 或 'text'
  const [image, setImage] = useState<string | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [addingCoupon, setAddingCoupon] = useState(false)
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

      // 调用API
      const apiResponse = await fetch('/api/parse-coupon-image', {
        method: 'POST',
        body: formData,
      })

      const result = await apiResponse.json()

      if (result.success) {
        setAiResult(result.data)
        console.log('ChatGPT识别结果:', result.data)

        // 注意：不再自动添加第一张，而是让用户从列表中选择
      } else {
        setError(result.error || 'AI识别失败')
      }
    } catch (err: any) {
      console.error('ChatGPT识别失败:', err)
      setError('AI识别失败，请重试')
    } finally {
      setIsRecognizing(false)
    }
  }

  const handleAddCoupon = async (coupon: any) => {
    if (!onDirectAdd) {
      console.warn('onDirectAdd callback not provided')
      return
    }

    setAddingCoupon(true)

    try {
      const extractedInfo: ExtractedCouponInfo = {
        storeName: coupon.storeName || '',
        title: coupon.title || '',
        description: coupon.description || '',
        discountType: coupon.discountType,
        discountAmount: coupon.discountAmount,
        fullAmount: coupon.fullAmount,
        startDate: coupon.startDate,
        endDate: coupon.endDate,
        endHour: coupon.endHour !== undefined ? coupon.endHour : 23,
        endMinute: coupon.endMinute !== undefined ? coupon.endMinute : 59,
        notes: coupon.notes ? `AI识别: ChatGPT, ${coupon.notes}` : `AI识别: ChatGPT`,
      }

      // 直接添加优惠券
      await onDirectAdd([extractedInfo])
    } catch (error) {
      console.error('添加优惠券失败:', error)
      setError('添加优惠券失败，请重试')
    } finally {
      setAddingCoupon(false)
    }
  }

  const handleAddAllCoupons = async () => {
    if (!aiResult?.coupons || aiResult.coupons.length === 0) return
    if (!onDirectAdd) {
      console.warn('onDirectAdd callback not provided')
      return
    }

    setAddingCoupon(true)

    try {
      // 将所有优惠券转换为ExtractedCouponInfo格式
      const extractedInfos: ExtractedCouponInfo[] = aiResult.coupons.map((coupon: any) => ({
        storeName: coupon.storeName || '',
        title: coupon.title || '',
        description: coupon.description || '',
        discountType: coupon.discountType,
        discountAmount: coupon.discountAmount,
        fullAmount: coupon.fullAmount,
        startDate: coupon.startDate,
        endDate: coupon.endDate,
        endHour: coupon.endHour !== undefined ? coupon.endHour : 23,
        endMinute: coupon.endMinute !== undefined ? coupon.endMinute : 59,
        notes: coupon.notes ? `AI识别: ChatGPT, ${coupon.notes}` : `AI识别: ChatGPT`,
      }))

      // 批量添加所有优惠券
      await onDirectAdd(extractedInfos)
    } catch (error) {
      console.error('批量添加优惠券失败:', error)
      setError('批量添加优惠券失败，请重试')
    } finally {
      setAddingCoupon(false)
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
        onExtracted?.(result.data)
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
        onExtracted?.(result.data)
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
                <div className="relative h-64 bg-muted/30 rounded-lg border flex items-center justify-center overflow-hidden">
                  <img
                    src={image}
                    alt="优惠券截图"
                    className="max-h-full max-w-full object-contain"
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
                    ChatGPT将自动识别商家、优惠名称、优惠条件和到期时间
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
                  <div className="relative h-64 bg-muted/30 rounded-lg border flex items-center justify-center overflow-hidden">
                    <img
                      src={image}
                      alt="优惠券截图"
                      className="max-h-full max-w-full object-contain"
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
                      ChatGPT将智能识别优惠券信息
                    </p>
                  </div>

                  {/* 识别结果 */}
                  {aiResult?.coupons && aiResult.coupons.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">
                          识别结果：共 {aiResult.coupons.length} 张优惠券
                        </div>
                        {aiResult.coupons.length > 1 && (
                          <Button
                            size="sm"
                            onClick={handleAddAllCoupons}
                            disabled={addingCoupon}
                            className="gap-2"
                          >
                            {addingCoupon ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                添加中...
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4" />
                                全部添加
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <div className="space-y-3">
                        {aiResult.coupons.map((coupon: any, index: number) => (
                          <Card key={index} className="border">
                            <CardContent className="p-4 space-y-3">
                              {/* 商家和标题 */}
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <div className="font-medium text-lg">
                                    {coupon.storeName || '未知商家'}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {coupon.title || '未知优惠券'}
                                  </div>
                                </div>
                                <Badge variant={getCouponTypeBadge(coupon.discountType)}>
                                  {getDiscountTypeLabel(coupon.discountType)}
                                </Badge>
                              </div>

                              {/* 优惠详情 */}
                              {coupon.discountAmount && (
                                <div className="text-sm">
                                  {coupon.discountType === 'full' ? (
                                    <span>满 <strong>{coupon.fullAmount}</strong> 减 <strong className="text-primary">{coupon.discountAmount}</strong> 元</span>
                                  ) : coupon.discountType === 'percentage' ? (
                                    <span>折扣 <strong className="text-primary">{coupon.discountAmount}</strong> 折</span>
                                  ) : (
                                    <span>立减 <strong className="text-primary">{coupon.discountAmount}</strong> 元</span>
                                  )}
                                </div>
                              )}

                              {/* 到期时间 */}
                              {coupon.endDate && (
                                <div className="flex items-center gap-2 text-sm">
                                  <span className={`font-medium ${getExpiryColor(coupon.endDate)}`}>
                                    {formatExpiryDate(coupon.endDate)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    剩余 {getDaysRemaining(coupon.endDate)} 天
                                  </span>
                                </div>
                              )}

                              {/* 备注 */}
                              {coupon.description && (
                                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                                  {coupon.description}
                                </div>
                              )}

                              {/* 添加按钮 */}
                              <Button
                                size="sm"
                                onClick={() => handleAddCoupon(coupon)}
                                disabled={addingCoupon}
                                className="w-full gap-2"
                              >
                                {addingCoupon ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    添加中...
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-4 w-4" />
                                    添加此优惠券
                                  </>
                                )}
                              </Button>
                            </CardContent>
                          </Card>
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
                      开始ChatGPT识别
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
