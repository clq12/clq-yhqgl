"use client"

import { useState } from "react"
import { Upload, X, Loader2, ScanText, Check, AlertCircle, Image as ImageIcon, FileJson, Download, Upload as ImportIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

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
  storeName?: string
  description?: string
  notes?: string
}

interface ImageFile {
  file: File
  preview: string
  status: 'pending' | 'recognizing' | 'recognized' | 'failed'
  ocrResult?: OcrResult
  extractedInfo?: ExtractedCouponInfo
  error?: string
}

interface BatchOcrRecognizerProps {
  onBatchExtracted: (infos: ExtractedCouponInfo[]) => void
  onCancel?: () => void
}

export default function BatchOcrRecognizer({ onBatchExtracted, onCancel }: BatchOcrRecognizerProps) {
  const [mode, setMode] = useState<'image' | 'text'>('image')
  const [images, setImages] = useState<ImageFile[]>([])
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pastedText, setPastedText] = useState('')

  const handleFilesSelect = (files: FileList | null) => {
    setError(null)

    if (!files || files.length === 0) return

    // 验证文件数量（限制为10张）
    if (files.length > 10) {
      setError('最多只能选择10张图片')
      return
    }

    const newImages: ImageFile[] = []

    Array.from(files).forEach((file) => {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        setError(`文件 ${file.name} 不是图片格式`)
        return
      }

      // 验证文件大小（限制为10MB）
      if (file.size > 10 * 1024 * 1024) {
        setError(`图片 ${file.name} 大小超过10MB`)
        return
      }

      // 读取图片并预览
      const reader = new FileReader()
      reader.onload = (e) => {
        newImages.push({
          file,
          preview: e.target?.result as string,
          status: 'pending',
        })

        // 所有文件处理完成后更新状态
        if (newImages.length === Math.min(files.length, 10)) {
          setImages(prev => [...prev, ...newImages])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFilesSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const recognizeAllImages = async () => {
    if (images.length === 0) return

    setIsRecognizing(true)
    setError(null)
    setProgress(0)

    try {
      for (let i = 0; i < images.length; i++) {
        const img = images[i]

        // 更新状态为识别中
        setImages(prev => prev.map((item, idx) =>
          idx === i ? { ...item, status: 'recognizing' } : item
        ))

        try {
          // 调用AI识别API
          const response = await fetch('/api/ai-recognize-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: img.preview }),
          })

          const result = await response.json()

          if (result.success && result.data) {
            // 更新识别结果
            setImages(prev => prev.map((item, idx) =>
              idx === i ? {
                ...item,
                status: 'recognized',
                ocrResult: {
                  text: JSON.stringify(result.data),
                  confidence: 100
                },
                extractedInfo: result.data
              } : item
            ))
          } else {
            throw new Error(result.error || '识别失败')
          }
        } catch (err) {
          console.error(`识别图片 ${img.file.name} 失败:`, err)
          setImages(prev => prev.map((item, idx) =>
            idx === i ? {
              ...item,
              status: 'failed',
              error: err instanceof Error ? err.message : '识别失败'
            } : item
          ))
        }

        // 更新总进度
        setProgress(Math.round(((i + 1) / images.length) * 100))
      }
    } catch (err) {
      console.error('批量识别失败:', err)
      setError('批量识别失败，请重试')
    } finally {
      setIsRecognizing(false)
    }
  }

  const extractAllCoupons = async () => {
    const recognizedImages = images.filter(img => img.status === 'recognized' && img.extractedInfo)

    if (recognizedImages.length === 0) return

    setIsExtracting(true)
    setError(null)

    try {
      const extractedInfos: ExtractedCouponInfo[] = recognizedImages
        .map(img => img.extractedInfo!)
        .filter(info => info !== undefined)

      if (extractedInfos.length > 0) {
        onBatchExtracted(extractedInfos)
      } else {
        setError('未能提取到任何优惠券信息')
      }
    } catch (err) {
      console.error('批量解析失败:', err)
      setError('批量解析失败，请重试')
    } finally {
      setIsExtracting(false)
    }
  }

  const handleParseText = async () => {
    if (!pastedText.trim()) return

    setIsExtracting(true)
    setError(null)

    try {
      // 尝试分割多个优惠券文本
      const couponTexts = splitCouponTexts(pastedText)

      const extractedInfos: ExtractedCouponInfo[] = []

      for (let i = 0; i < couponTexts.length; i++) {
        const couponText = couponTexts[i]

        try {
          // 调用AI识别API
          const response = await fetch('/api/ai-recognize-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: couponText }),
          })

          const result = await response.json()

          if (result.success && result.data) {
            extractedInfos.push(result.data)
          }
        } catch (err) {
          console.error(`解析第${i + 1}个优惠券失败:`, err)
        }

        // 更新进度
        setProgress(Math.round(((i + 1) / couponTexts.length) * 100))
      }

      if (extractedInfos.length > 0) {
        onBatchExtracted(extractedInfos)
      } else {
        setError('未能提取到任何优惠券信息')
      }
    } catch (err) {
      console.error('批量解析失败:', err)
      setError('批量解析失败，请重试')
    } finally {
      setIsExtracting(false)
    }
  }

  /**
   * 分割多个优惠券文本
   * 根据关键词（如"优惠券"、"券"等）和金额模式进行分割
   */
  function splitCouponTexts(text: string): string[] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line)

    if (lines.length === 0) {
      return [text]
    }

    const couponTexts: string[] = []
    let currentCoupon: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : ''

      // 检测新优惠券的开始标志
      // 条件：以银行名称开头 且 前一行不是银行名称（避免重复）
      // 或者 以"¥"、"优惠券"、"立减金"开头 且 前一个优惠券已经有内容
      const isBankStart = /^(建设银行|工商银行|农业银行|中国银行|招商银行|交通银行|中信银行|光大银行|民生银行|平安银行|浦发银行)/.test(line)
      const isNewCoupon = (isBankStart && !prevLine.match(/建设银行|工商银行|农业银行|中国银行|招商银行|交通银行|中信银行|光大银行|民生银行|平安银行|浦发银行/)) ||
                          (/^(¥\d+|￥\d+)/.test(line) && currentCoupon.length > 3) ||
                          (/^(优惠券|立减金|银行立减金)/.test(line) && currentCoupon.length > 3)

      if (isNewCoupon && currentCoupon.length > 0) {
        // 保存当前优惠券
        couponTexts.push(currentCoupon.join('\n'))
        currentCoupon = []
      }

      currentCoupon.push(line)
    }

    // 保存最后一个优惠券
    if (currentCoupon.length > 0) {
      couponTexts.push(currentCoupon.join('\n'))
    }

    // 如果没有分割出来，返回整个文本
    if (couponTexts.length === 0) {
      return [text]
    }

    return couponTexts
  }

  const clearAll = () => {
    setImages([])
    setError(null)
    setProgress(0)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanText className="h-5 w-5" />
          AI智能识别优惠券
        </CardTitle>
        <CardDescription>
          使用AI自动识别优惠券图片或文本，提取优惠券信息并批量添加
        </CardDescription>
        <Tabs value={mode} onValueChange={(value) => setMode(value as 'image' | 'text')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              图片识别
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-2">
              <FileJson className="h-4 w-4" />
              文本识别
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

        <Tabs value={mode} onValueChange={(value) => setMode(value as 'image' | 'text')} className="w-full">
          {/* 图片识别模式 */}
          <TabsContent value="image" className="space-y-4 mt-0">
            {images.length === 0 ? (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = 'image/*'
                  input.multiple = true
                  input.onchange = (e) => handleFilesSelect((e.target as HTMLInputElement).files)
                  input.click()
                }}
              >
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  拖拽多张图片到此处，或点击选择
                </p>
                <p className="text-xs text-muted-foreground">
                  最多10张图片，支持 JPG、PNG、WEBP 格式，每张最大10MB
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 图片列表 */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map((img, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={img.preview}
                        alt={img.file.name}
                        className="w-full h-32 object-cover rounded-lg border"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0"
                        onClick={() => removeImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <div className="absolute bottom-1 left-1 right-1">
                        {img.status === 'pending' && (
                          <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">
                            等待识别
                          </div>
                        )}
                        {img.status === 'recognizing' && (
                          <div className="bg-blue-500/80 text-white text-xs px-2 py-1 rounded">
                            识别中...
                          </div>
                        )}
                        {img.status === 'recognized' && (
                          <div className="bg-green-500/80 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            识别成功
                          </div>
                        )}
                        {img.status === 'failed' && (
                          <div className="bg-red-500/80 text-white text-xs px-2 py-1 rounded">
                            识别失败
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 进度显示 */}
                {(isRecognizing || isExtracting) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isRecognizing ? `AI识别中... ${progress}%` : `正在添加... ${progress}%`}
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <Button
                    onClick={recognizeAllImages}
                    disabled={isRecognizing || isExtracting || images.some(img => img.status === 'recognizing')}
                    className="flex-1 gap-2"
                  >
                    <ScanText className="h-4 w-4" />
                    AI智能识别
                  </Button>
                  <Button
                    onClick={clearAll}
                    variant="outline"
                    disabled={isRecognizing || isExtracting}
                  >
                    清空
                  </Button>
                </div>

                {/* 提取按钮 */}
                {images.some(img => img.status === 'recognized') && !isRecognizing && (
                  <Button
                    onClick={extractAllCoupons}
                    disabled={isExtracting}
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
                        批量添加 ({images.filter(img => img.status === 'recognized').length} 张)
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          {/* 文本粘贴模式 */}
          <TabsContent value="text" className="space-y-4 mt-0">
            <div className="space-y-3">
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="粘贴优惠券的文本信息，AI会智能提取：&#10;• 淘宝优惠券&#10;• 满100减20元&#10;• 有效期至2024-12-31 23点&#10;• 可以粘贴多个优惠券"
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
                    AI识别中...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    AI智能提取
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
