"use client"

import { useState, useEffect } from "react"
import { Check, X, ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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

  // 当对话框打开时初始化数据
  useEffect(() => {
    if (isOpen && coupons.length > 0 && previewCoupons.length === 0) {
      initializePreviews()
    }
  }, [isOpen, coupons.length])

  const currentCoupon = previewCoupons[currentIndex] || null

  if (!currentCoupon) {
    return null
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              确认优惠券信息 ({currentIndex + 1}/{previewCoupons.length})
            </DialogTitle>
            <DialogDescription>
              请检查并编辑识别到的优惠券信息，确认后点击"添加"按钮
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 导航按钮（多张优惠券时显示） */}
            {previewCoupons.length > 1 && (
              <div className="flex items-center justify-between">
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

            {/* 表单字段 */}
            <div className="space-y-4">
              {/* 标题 */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  优惠券名称 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  value={currentCoupon.title || ''}
                  onChange={(e) => updateCurrentCoupon('title', e.target.value)}
                  placeholder="例如：京东满减优惠券"
                />
              </div>

              {/* 店铺名称 */}
              <div className="space-y-2">
                <Label htmlFor="storeName">店铺名称</Label>
                <Input
                  id="storeName"
                  value={currentCoupon.storeName || ''}
                  onChange={(e) => updateCurrentCoupon('storeName', e.target.value)}
                  placeholder="例如：京东、淘宝、建设银行"
                />
              </div>

              {/* 优惠类型和金额 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discountType">
                    优惠类型 <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={currentCoupon.discountType || 'amount'}
                    onValueChange={(value) => updateCurrentCoupon('discountType', value)}
                  >
                    <SelectTrigger id="discountType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amount">减免金额</SelectItem>
                      <SelectItem value="percentage">折扣</SelectItem>
                      <SelectItem value="full">满减</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discountAmount">
                    优惠金额/折扣 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="discountAmount"
                    type="number"
                    step="0.01"
                    value={currentCoupon.discountAmount || ''}
                    onChange={(e) => updateCurrentCoupon('discountAmount', parseFloat(e.target.value) || 0)}
                    placeholder={
                      currentCoupon.discountType === 'percentage'
                        ? '例如：8（表示8折）'
                        : '例如：20（表示减20元）'
                    }
                  />
                </div>
              </div>

              {/* 满减金额（仅满减类型显示） */}
              {currentCoupon.discountType === 'full' && (
                <div className="space-y-2">
                  <Label htmlFor="fullAmount">
                    满减门槛 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="fullAmount"
                    type="number"
                    step="0.01"
                    value={currentCoupon.fullAmount || ''}
                    onChange={(e) => updateCurrentCoupon('fullAmount', parseFloat(e.target.value) || 0)}
                    placeholder="例如：100（表示满100元）"
                  />
                </div>
              )}

              {/* 截止日期和时间 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="endDate">
                    截止日期 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={currentCoupon.endDate || ''}
                    onChange={(e) => updateCurrentCoupon('endDate', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="endHour">小时</Label>
                    <Select
                      value={String(currentCoupon.endHour || 23)}
                      onValueChange={(value) => updateCurrentCoupon('endHour', parseInt(value))}
                    >
                      <SelectTrigger id="endHour">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {i}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="endMinute">分钟</Label>
                    <Select
                      value={String(currentCoupon.endMinute || 59)}
                      onValueChange={(value) => updateCurrentCoupon('endMinute', parseInt(value))}
                    >
                      <SelectTrigger id="endMinute">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {Array.from({ length: 60 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {String(i).padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* 描述 */}
              <div className="space-y-2">
                <Label htmlFor="description">描述</Label>
                <Input
                  id="description"
                  value={currentCoupon.description || ''}
                  onChange={(e) => updateCurrentCoupon('description', e.target.value)}
                  placeholder="例如：饮品通用、仅限新用户"
                />
              </div>

              {/* AI 识别信息 */}
              {(currentCoupon.aiModel || currentCoupon.rawResponse) && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div className="text-sm font-medium">AI 识别信息</div>
                  
                  {currentCoupon.aiModel && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">识别模型：</span>
                      <Badge variant={
                        currentCoupon.aiModel === 'glm' ? 'default' :
                        currentCoupon.aiModel === 'doubao' ? 'secondary' :
                        'outline'
                      }>
                        {currentCoupon.aiModel === 'glm' ? 'GLM-4.7-Flash' :
                         currentCoupon.aiModel === 'doubao' ? '豆包 AI' :
                         '规则匹配'}
                      </Badge>
                    </div>
                  )}

                  {currentCoupon.rawResponse && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>原始返回值</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-xs"
                          onClick={() => navigator.clipboard.writeText(currentCoupon.rawResponse || '')}
                        >
                          复制
                        </Button>
                      </div>
                      <div className="text-xs bg-background p-2 rounded max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
                        {currentCoupon.rawResponse}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              取消
            </Button>
            <Button onClick={handleConfirm}>
              <Check className="h-4 w-4 mr-2" />
              添加 ({previewCoupons.length} 张)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
