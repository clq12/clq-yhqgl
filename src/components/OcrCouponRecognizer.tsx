"use client"

import { useState, useRef } from "react"
import { Upload, X, Loader2, ScanText, Check, AlertCircle, FileText, Image as ImageIcon, Sparkles, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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

// 辅助函数：从ISO字符串中提取日期部分（YYYY-MM-DD）
function extractDatePart(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined
  
  // 如果是纯日期格式（YYYY-MM-DD），直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }
  
  // 如果是带时间的ISO格式，提取日期部分
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0]
  }
  
  return dateStr
}

// 辅助函数：从ISO字符串中提取小时和分钟（转换为北京时间）
function extractTimeParts(dateStr: string | undefined): { hour: number | undefined, minute: number | undefined } {
  if (!dateStr || !dateStr.includes('T')) {
    return { hour: undefined, minute: undefined }
  }
  
  try {
    // 如果是UTC时间（带Z后缀），需要转换为北京时间
    if (dateStr.endsWith('Z')) {
      const utcDate = new Date(dateStr)
      // UTC时间 + 8小时 = 北京时间
      const beijingHour = (utcDate.getUTCHours() + 8) % 24
      const beijingMinute = utcDate.getUTCMinutes()
      return { hour: beijingHour, minute: beijingMinute }
    }
    
    // 带时区偏移的时间（如 +08:00），提取原始时间（已经是北京时间）
    // 例如：2026-03-31T23:59:00.000+08:00
    const timePart = dateStr.split('T')[1] // 23:59:00.000+08:00
    const timeWithoutOffset = timePart.split(/[+-]/)[0] // 23:59:00.000
    const timeWithoutMs = timeWithoutOffset.split('.')[0] // 23:59:00
    const [hour, minute] = timeWithoutMs.split(':').map(Number)
    
    return { 
      hour: isNaN(hour) ? undefined : hour, 
      minute: isNaN(minute) ? undefined : minute 
    }
  } catch (e) {
    return { hour: undefined, minute: undefined }
  }
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
  const [selectedCoupons, setSelectedCoupons] = useState<Set<number>>(new Set())
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

        // 重置选中状态，默认全选
        if (result.data.coupons && result.data.coupons.length > 0) {
          setSelectedCoupons(new Set(result.data.coupons.map((_: any, index: number) => index)))
        } else {
          setSelectedCoupons(new Set())
        }
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

  const handleToggleCoupon = (index: number) => {
    setSelectedCoupons(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const handleToggleSelectAll = () => {
    if (!aiResult?.coupons) return

    if (selectedCoupons.size === aiResult.coupons.length) {
      // 如果全部选中，则取消全选
      setSelectedCoupons(new Set())
    } else {
      // 否则全选
      setSelectedCoupons(new Set(aiResult.coupons.map((_: any, index: number) => index)))
    }
  }

  const handleAddSelectedCoupons = async () => {
    if (!aiResult?.coupons || aiResult.coupons.length === 0) return
    if (!onDirectAdd) {
      console.warn('onDirectAdd callback not provided')
      return
    }

    if (selectedCoupons.size === 0) {
      setError('请先选择要添加的优惠券')
      return
    }

    setAddingCoupon(true)

    try {
      // 将选中的优惠券转换为ExtractedCouponInfo格式
      const extractedInfos: ExtractedCouponInfo[] = []
      selectedCoupons.forEach(index => {
        const coupon = aiResult.coupons[index]
        
        // 处理时间格式
        const endDatePart = extractDatePart(coupon.endDate)
        const { hour: extractedHour, minute: extractedMinute } = extractTimeParts(coupon.endDate)
        const startDatePart = extractDatePart(coupon.startDate)
        
        extractedInfos.push({
          storeName: coupon.storeName || '',
          title: coupon.title || '',
          description: coupon.description || '',
          discountType: coupon.discountType,
          discountAmount: coupon.discountAmount,
          fullAmount: coupon.fullAmount,
          startDate: startDatePart,
          endDate: endDatePart,
          endHour: coupon.endHour !== undefined ? coupon.endHour : (extractedHour !== undefined ? extractedHour : 23),
          endMinute: coupon.endMinute !== undefined ? coupon.endMinute : (extractedMinute !== undefined ? extractedMinute : 59),
          notes: coupon.notes ? `AI识别: ChatGPT, ${coupon.notes}` : `AI识别: ChatGPT`,
        })
      })

      // 批量添加选中的优惠券
      await onDirectAdd(extractedInfos)
    } catch (error) {
      console.error('批量添加优惠券失败:', error)
      setError('批量添加优惠券失败，请重试')
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
      console.log('=== handleAddAllCoupons 开始 ===')
      console.log('aiResult.coupons:', JSON.stringify(aiResult.coupons, null, 2))
      
      // 将所有优惠券转换为ExtractedCouponInfo格式
      const extractedInfos: ExtractedCouponInfo[] = aiResult.coupons.map((coupon: any, index: number) => {
        // 处理时间格式
        const endDatePart = extractDatePart(coupon.endDate)
        const { hour: extractedHour, minute: extractedMinute } = extractTimeParts(coupon.endDate)
        const startDatePart = extractDatePart(coupon.startDate)
        
        console.log(`[${index}] 原始数据:`, {
          startDate: coupon.startDate,
          endDate: coupon.endDate,
          endHour: coupon.endHour,
          endMinute: coupon.endMinute
        })
        console.log(`[${index}] 处理后:`, {
          startDatePart,
          endDatePart,
          extractedHour,
          extractedMinute
        })
        
        return {
          storeName: coupon.storeName || '',
          title: coupon.title || '',
          description: coupon.description || '',
          discountType: coupon.discountType,
          discountAmount: coupon.discountAmount,
          fullAmount: coupon.fullAmount,
          startDate: startDatePart,
          endDate: endDatePart,
          endHour: coupon.endHour !== undefined ? coupon.endHour : (extractedHour !== undefined ? extractedHour : 23),
          endMinute: coupon.endMinute !== undefined ? coupon.endMinute : (extractedMinute !== undefined ? extractedMinute : 59),
          notes: coupon.notes ? `AI识别: ChatGPT, ${coupon.notes}` : `AI识别: ChatGPT`,
        }
      })

      console.log('最终extractedInfos:', JSON.stringify(extractedInfos, null, 2))
      
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
    setSelectedCoupons(new Set())
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
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-medium">
                            识别结果：共 {aiResult.coupons.length} 张优惠券
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="select-all"
                              checked={selectedCoupons.size === aiResult.coupons.length && aiResult.coupons.length > 0}
                              onCheckedChange={handleToggleSelectAll}
                            />
                            <label
                              htmlFor="select-all"
                              className="text-sm text-muted-foreground cursor-pointer select-none"
                            >
                              全选
                            </label>
                            {selectedCoupons.size > 0 && (
                              <span className="text-xs text-primary">
                                已选 {selectedCoupons.size} 张
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedCoupons.size > 0 && (
                            <Button
                              size="sm"
                              onClick={handleAddSelectedCoupons}
                              disabled={addingCoupon}
                              variant="default"
                              className="gap-2"
                            >
                              {addingCoupon ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  添加中...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4" />
                                  添加选中的 ({selectedCoupons.size})
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={handleAddAllCoupons}
                            disabled={addingCoupon}
                            variant="outline"
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
                        </div>
                      </div>
                      <div className="space-y-3">
                        {aiResult.coupons.map((coupon: any, index: number) => (
                          <Card
                            key={index}
                            className={`border cursor-pointer transition-colors ${
                              selectedCoupons.has(index) ? 'bg-primary/5 border-primary' : ''
                            }`}
                            onClick={(e) => {
                              // 避免点击复选框时触发两次
                              if (!(e.target as HTMLElement).closest('input[type="checkbox"]')) {
                                handleToggleCoupon(index)
                              }
                            }}
                          >
                            <CardContent className="p-4">
                              <div className="flex gap-3">
                                {/* 复选框 */}
                                <div className="pt-1">
                                  <Checkbox
                                    checked={selectedCoupons.has(index)}
                                    onCheckedChange={() => handleToggleCoupon(index)}
                                  />
                                </div>

                                {/* 优惠券内容 */}
                                <div className="flex-1 space-y-3">
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
                                </div>
                              </div>
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
