"use client"

import { useState, useEffect } from "react"
import { Check, X, ArrowLeft, ArrowRight, MessageSquare, Eye, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { ExtractedCouponInfo } from "./TextRecognizer"

export interface PreviewCoupon extends ExtractedCouponInfo {
  id: string
}

interface CouponPreviewDialogProps {
  isOpen: boolean
  coupons: ExtractedCouponInfo[]
  onConfirm: (coupons: PreviewCoupon[]) => void
  onCancel: () => void
}

export default function CouponPreviewDialog({
  isOpen,
  coupons,
  onConfirm,
  onCancel,
}: CouponPreviewDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [previewCoupons, setPreviewCoupons] = useState<PreviewCoupon[]>([])

  // 初始化预览数据
  const initializePreviews = () => {
    const previews = coupons.map((coupon, index) => ({
      ...coupon,
      id: `preview-${Date.now()}-${index}`,
    }))
    setPreviewCoupons(previews)
    setCurrentIndex(0)
  }

  // 更新当前优惠券的字段
  const updateCurrentCoupon = (field: keyof PreviewCoupon, value: any) => {
    setPreviewCoupons(prev => {
      const newCoupons = [...prev]
      newCoupons[currentIndex] = {
        ...newCoupons[currentIndex],
        [field]: value,
      }
      return newCoupons
    })
  }

  const handleConfirm = () => {
    onConfirm(previewCoupons)
    // 重置状态
    setPreviewCoupons([])
    setCurrentIndex(0)
  }

  const handleCancel = () => {
    setPreviewCoupons([])
    setCurrentIndex(0)
    onCancel()
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleNext = () => {
    if (currentIndex < previewCoupons.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const currentCoupon = previewCoupons[currentIndex] || null

  // 当对话框打开时初始化数据
  useEffect(() => {
    if (isOpen && coupons.length > 0 && previewCoupons.length === 0) {
      initializePreviews()
    }
  }, [isOpen, coupons, previewCoupons.length])

  if (!currentCoupon) {
    return null
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              AI识别结果确认 ({currentIndex + 1}/{previewCoupons.length})
            </DialogTitle>
            <DialogDescription>
              查看AI识别的原始结果，确认或修改后添加
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="chat" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                AI对话
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                预览
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="space-y-4">
              {/* 原始文本 */}
              <div>
                <Label className="text-sm font-medium">原始识别文本</Label>
                <Textarea
                  value={currentCoupon.originalText || ''}
                  readOnly
                  className="mt-2 bg-muted"
                  rows={3}
                />
              </div>

              {/* AI原始返回 */}
              {currentCoupon._debug && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-sm font-medium">AI原始返回</Label>
                    <Badge variant="outline">{currentCoupon._debug.aiModel}</Badge>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-[300px]">
                    {JSON.stringify(currentCoupon._debug.aiRawResult, null, 2)}
                  </pre>
                </div>
              )}

              {/* 识别说明 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
                <p className="font-medium mb-1">识别说明：</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                  <li>AI已自动提取优惠券信息</li>
                  <li>如果识别有误，可以切换到"预览"标签页手动修改</li>
                  <li>确认无误后点击"添加"按钮保存</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4">
              {/* 表单字段 */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label className="text-sm font-medium">标题 *</Label>
                  <Input
                    value={currentCoupon.title || ''}
                    onChange={(e) => updateCurrentCoupon('title', e.target.value)}
                    placeholder="优惠券标题"
                    className="mt-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">优惠金额/折扣 *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentCoupon.discountAmount || ''}
                      onChange={(e) => updateCurrentCoupon('discountAmount', parseFloat(e.target.value))}
                      placeholder="如：20 或 8.5"
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium">优惠类型 *</Label>
                    <Select
                      value={currentCoupon.discountType || 'amount'}
                      onValueChange={(value) => updateCurrentCoupon('discountType', value)}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">减免金额</SelectItem>
                        <SelectItem value="percentage">折扣</SelectItem>
                        <SelectItem value="full">满减</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {currentCoupon.discountType === 'full' && (
                  <div>
                    <Label className="text-sm font-medium">满减金额</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={currentCoupon.fullAmount || ''}
                      onChange={(e) => updateCurrentCoupon('fullAmount', parseFloat(e.target.value))}
                      placeholder="如：100"
                      className="mt-2"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">截止日期 *</Label>
                    <Input
                      type="date"
                      value={currentCoupon.endDate?.split('T')[0] || ''}
                      onChange={(e) => updateCurrentCoupon('endDate', e.target.value)}
                      className="mt-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-sm font-medium">截止小时</Label>
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        value={currentCoupon.endHour ?? 23}
                        onChange={(e) => updateCurrentCoupon('endHour', parseInt(e.target.value))}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">截止分钟</Label>
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        value={currentCoupon.endMinute ?? 59}
                        onChange={(e) => updateCurrentCoupon('endMinute', parseInt(e.target.value))}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">店铺名称</Label>
                    <Input
                      value={currentCoupon.storeName || ''}
                      onChange={(e) => updateCurrentCoupon('storeName', e.target.value)}
                      placeholder="如：京东云"
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium">描述</Label>
                    <Input
                      value={currentCoupon.description || ''}
                      onChange={(e) => updateCurrentCoupon('description', e.target.value)}
                      placeholder="如：无门槛券"
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* 导航按钮（多张优惠券时显示） */}
          {previewCoupons.length > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                上一张
              </Button>
              <div className="text-sm text-muted-foreground">
                第 {currentIndex + 1} 张，共 {previewCoupons.length} 张
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={currentIndex === previewCoupons.length - 1}
              >
                下一张
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1"
            >
              <Check className="h-4 w-4 mr-2" />
              添加优惠券
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
