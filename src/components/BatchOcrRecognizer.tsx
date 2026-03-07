"use client"

import { useState } from "react"
import { Upload, X, Loader2, ScanText, Check, AlertCircle, Image as ImageIcon, FileJson, Download, Upload as ImportIcon, Copy, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import CouponPreviewDialog, { type PreviewCoupon } from "@/components/CouponPreviewDialog"

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
  const [mode, setMode] = useState<'image' | 'text'>('text')
  const [images, setImages] = useState<ImageFile[]>([])
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [useAI, setUseAI] = useState(true)
  const [aiModel, setAiModel] = useState<'doubao' | 'glm'>('doubao')
  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null)

  // 预览对话框状态
  const [showPreview, setShowPreview] = useState(false)
  const [previewCoupons, setPreviewCoupons] = useState<ExtractedCouponInfo[]>([])


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
      const Tesseract = (await import('tesseract.js')).default

      for (let i = 0; i < images.length; i++) {
        const img = images[i]

        // 更新状态为识别中
        setImages(prev => prev.map((item, idx) =>
          idx === i ? { ...item, status: 'recognizing' } : item
        ))

        try {
          const result = await Tesseract.recognize(
            img.preview,
            'chi_sim',
            {
              logger: (m: any) => {
                // 更新识别进度（每张图片的进度）
                if (m.status === 'recognizing text') {
                  const imageProgress = Math.round(m.progress * 100)
                  // 计算总进度
                  const totalProgress = Math.round(((i) / images.length) * 100 + (imageProgress / images.length))
                  setProgress(totalProgress)
                }
              },
            }
          )

          // 检查识别质量
          const confidence = result.data.confidence
          const recognizedText = result.data.text.trim()

          if (confidence < 50) {
            // 识别置信度过低，显示警告
            setImages(prev => prev.map((item, idx) =>
              idx === i ? {
                ...item,
                status: 'recognized',
                ocrResult: {
                  text: recognizedText,
                  confidence: confidence,
                }
              } : item
            ))
          } else {
            // 识别成功
            setImages(prev => prev.map((item, idx) =>
              idx === i ? {
                ...item,
                status: 'recognized',
                ocrResult: {
                  text: recognizedText,
                  confidence: confidence,
                }
              } : item
            ))
          }
        } catch (err) {
          console.error(`识别图片 ${img.file.name} 失败:`, err)
          setImages(prev => prev.map((item, idx) =>
            idx === i ? {
              ...item,
              status: 'failed',
              error: '识别失败'
            } : item
          ))
        }

        // 确保进度达到100%
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
    const recognizedImages = images.filter(img => img.status === 'recognized' && img.ocrResult)

    if (recognizedImages.length === 0) return

    setIsExtracting(true)
    setError(null)

    try {
      const extractedInfos: ExtractedCouponInfo[] = []

      for (let i = 0; i < recognizedImages.length; i++) {
        const img = recognizedImages[i]

        try {
          const requestBody: any = { text: img.ocrResult!.text, useAI }
          
          if (useAI) {
            requestBody.aiModel = aiModel
          }

          const response = await fetch('/api/parse-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          })

          const result = await response.json()

          if (result.success) {
            extractedInfos.push(result.data)
          }
        } catch (err) {
          console.error(`解析优惠券失败:`, err)
        }

        setProgress(Math.round(((i + 1) / recognizedImages.length) * 100))
      }

      if (extractedInfos.length > 0) {
        // 显示预览对话框，而不是直接添加
        setPreviewCoupons(extractedInfos)
        setShowPreview(true)
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
          const requestBody: any = { text: couponText, useAI }
          
          if (useAI) {
            requestBody.aiModel = aiModel
          }

          const response = await fetch('/api/parse-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          })

          const result = await response.json()

          if (result.success) {
            extractedInfos.push(result.data)
          }
        } catch (err) {
          console.error(`解析第${i + 1}个优惠券失败:`, err)
        }

        // 更新进度
        setProgress(Math.round(((i + 1) / couponTexts.length) * 100))
      }

      if (extractedInfos.length > 0) {
        // 显示预览对话框，而不是直接添加
        setPreviewCoupons(extractedInfos)
        setShowPreview(true)
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
   * 每行作为一个优惠券
   */
  function splitCouponTexts(text: string): string[] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line)

    if (lines.length === 0) {
      return [text]
    }

    // 每行作为一个优惠券
    const couponTexts: string[] = []
    for (const line of lines) {
      if (line.length > 0) {
        couponTexts.push(line)
      }
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // 处理预览确认
  const handlePreviewConfirm = (coupons: PreviewCoupon[]) => {
    // 转换为 ExtractedCouponInfo 格式
    const extractedInfos: ExtractedCouponInfo[] = coupons.map(coupon => {
      const { id, ...rest } = coupon
      return rest
    })
    
    onBatchExtracted(extractedInfos)
    setShowPreview(false)
    setPreviewCoupons([])
    
    // 清空输入
    if (mode === 'text') {
      setPastedText('')
    } else {
      setImages([])
    }
  }

  // 处理预览取消
  const handlePreviewCancel = () => {
    setShowPreview(false)
    setPreviewCoupons([])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanText className="h-5 w-5" />
          批量识别优惠券
        </CardTitle>
        <CardDescription>
          一次选择多张优惠券图片或粘贴文本，自动识别并批量添加
        </CardDescription>
        {/* 图片识别提示 */}
        {mode === 'image' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>图片识别建议：</strong>
              1. 确保图片清晰、文字不模糊
              2. 尽量裁剪掉无关背景，只保留优惠券文字部分
              3. 如果识别不准确，建议使用手机截屏OCR识别后复制文本
            </AlertDescription>
          </Alert>
        )}
        <Tabs value={mode} onValueChange={(value) => setMode(value as 'image' | 'text')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              批量图片识别
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-2">
              <FileJson className="h-4 w-4" />
              文本粘贴
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI识别选项 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <ScanText className="h-4 w-4 text-primary" />
              <div className="text-sm">
                <div className="font-medium">AI智能识别</div>
                <div className="text-xs text-muted-foreground">使用大语言模型解析，识别失败自动回退规则匹配</div>
              </div>
            </div>
            <Button
              variant={useAI ? "default" : "outline"}
              size="sm"
              onClick={() => setUseAI(!useAI)}
            >
              {useAI ? "已启用" : "启用"}
            </Button>
          </div>

          {/* AI模型选择 */}
          {useAI && (
            <div className="p-3 bg-muted rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">选择AI模型</div>
                <Select value={aiModel} onValueChange={(value) => setAiModel(value as 'doubao' | 'glm')}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doubao">豆包（推荐）</SelectItem>
                    <SelectItem value="glm">GLM-4.7-Flash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* GLM 提示信息 */}
              {aiModel === 'glm' && (
                <div className="text-xs text-muted-foreground">
                  GLM API Key 需要在 WebDAV 配置中设置（如果已配置则无需重复输入）
                </div>
              )}
            </div>
          )}
        </div>

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
                      {/* 查看识别文本按钮 */}
                      {img.status === 'recognized' && img.ocrResult && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute top-1 left-1 h-6 w-6 p-0"
                          onClick={() => setViewingImageIndex(index)}
                          title="查看识别文本"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      )}
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
                      {isRecognizing ? `正在识别图片... ${progress}%` : `正在解析信息... ${progress}%`}
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
                    批量识别
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

      {/* 查看识别文本对话框 */}
      <Dialog open={viewingImageIndex !== null} onOpenChange={() => setViewingImageIndex(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>识别文本</DialogTitle>
            <DialogDescription>
              这是AI识别出的文本，如有错误请手动修正
            </DialogDescription>
          </DialogHeader>
          {viewingImageIndex !== null && images[viewingImageIndex]?.ocrResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>置信度: {images[viewingImageIndex].ocrResult.confidence.toFixed(1)}%</span>
                {images[viewingImageIndex].ocrResult.confidence < 50 && (
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                )}
              </div>
              <Textarea
                value={images[viewingImageIndex].ocrResult.text}
                readOnly
                rows={10}
                className="text-sm"
              />
              <Button
                onClick={() => images[viewingImageIndex]?.ocrResult?.text && copyToClipboard(images[viewingImageIndex].ocrResult.text)}
                className="w-full gap-2"
              >
                <Copy className="h-4 w-4" />
                复制到剪贴板
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 优惠券预览对话框 */}
      <CouponPreviewDialog
        isOpen={showPreview}
        coupons={previewCoupons}
        onConfirm={handlePreviewConfirm}
        onCancel={handlePreviewCancel}
      />
    </Card>
  )
}
