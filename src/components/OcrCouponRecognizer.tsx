"use client"

import { useState, useRef } from "react"
import { Upload, X, Loader2, ScanText, Check, AlertCircle, FileText, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

interface OcrCouponRecognizerProps {
  onExtracted: (info: ExtractedCouponInfo) => void
  onCancel?: () => void
}

export default function OcrCouponRecognizer({ onExtracted, onCancel }: OcrCouponRecognizerProps) {
  const [mode, setMode] = useState<'image' | 'text'>('image') // 'image' 或 'text'
  const [image, setImage] = useState<string | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
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
        <Tabs value={mode} onValueChange={(value) => setMode(value as 'image' | 'text')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              图片识别
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

        <Tabs value={mode} onValueChange={(value) => setMode(value as 'image' | 'text')} className="w-full">
          {/* 图片识别模式 */}
          <TabsContent value="image" className="space-y-4 mt-0">
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
