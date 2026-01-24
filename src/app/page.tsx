"use client"

import { useEffect, useState } from "react"
import { Plus, Bell, Calendar, Trash2, Edit, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import CouponForm from "@/components/CouponForm"
import WebDAVConfig from "@/components/WebDAVConfig"
import type { Coupon } from "@/storage/database/shared/schema"

export default function Home() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [isReminding, setIsReminding] = useState<string | null>(null)
  const [isWebDAVConfigured, setIsWebDAVConfigured] = useState(false)
  const [checkingConfig, setCheckingConfig] = useState(true)

  // 检查 WebDAV 配置
  const checkWebDAVConfig = async () => {
    try {
      const response = await fetch("/api/webdav/config")
      const result = await response.json()
      setIsWebDAVConfigured(result.success && result.configured)
    } catch (error) {
      console.error("检查配置失败:", error)
      setIsWebDAVConfigured(false)
    } finally {
      setCheckingConfig(false)
    }
  }

  // 获取优惠券列表
  const fetchCoupons = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/coupons")
      const result = await response.json()
      if (result.success) {
        setCoupons(result.data)
      } else {
        // 如果是因为未配置 WebDAV，清空列表
        if (result.error === "请先配置 WebDAV") {
          setCoupons([])
        }
      }
    } catch (error) {
      console.error("获取优惠券列表失败:", error)
    } finally {
      setLoading(false)
    }
  }

  // 添加优惠券
  const handleAddCoupon = async (data: any) => {
    try {
      const response = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (result.success) {
        setIsAddDialogOpen(false)
        fetchCoupons()
      }
    } catch (error) {
      console.error("添加优惠券失败:", error)
    }
  }

  // 更新优惠券
  const handleUpdateCoupon = async (id: string, data: any) => {
    try {
      const response = await fetch(`/api/coupons/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (result.success) {
        setEditingCoupon(null)
        fetchCoupons()
      }
    } catch (error) {
      console.error("更新优惠券失败:", error)
    }
  }

  // 删除优惠券
  const handleDeleteCoupon = async (id: string) => {
    try {
      const response = await fetch(`/api/coupons/${id}`, {
        method: "DELETE",
      })
      const result = await response.json()
      if (result.success) {
        fetchCoupons()
      }
    } catch (error) {
      console.error("删除优惠券失败:", error)
    }
  }

  // 标记为已提醒
  const handleMarkReminded = async (id: string) => {
    try {
      setIsReminding(id)
      const response = await fetch(`/api/coupons/${id}/remind`, {
        method: "POST",
      })
      const result = await response.json()
      if (result.success) {
        fetchCoupons()
      }
    } catch (error) {
      console.error("标记提醒失败:", error)
    } finally {
      setIsReminding(null)
    }
  }

  // 计算剩余天数
  const getDaysRemaining = (endDate: Date | string) => {
    const end = new Date(endDate)
    const now = new Date()
    const diff = end.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return days
  }

  // 判断是否即将到期（7天内）
  const isExpiringSoon = (endDate: Date | string) => {
    const days = getDaysRemaining(endDate)
    return days <= 7 && days >= 0
  }

  // 判断是否已过期
  const isExpired = (endDate: Date | string) => {
    const days = getDaysRemaining(endDate)
    return days < 0
  }

  useEffect(() => {
    checkWebDAVConfig()
  }, [])

  useEffect(() => {
    if (isWebDAVConfigured) {
      fetchCoupons()
    } else {
      setLoading(false)
    }
  }, [isWebDAVConfigured])

  // 检查配置中
  if (checkingConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center text-gray-600 dark:text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto mb-4"></div>
          <p>检查配置中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* 移动端顶部栏 */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b px-4 py-4 dark:bg-gray-900/80 dark:border-gray-800">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              优惠券管理
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              记录优惠，不错过任何优惠
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full gap-2" disabled={!isWebDAVConfigured}>
                <Plus className="h-4 w-4" />
                添加
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>添加优惠券</DialogTitle>
                <DialogDescription>
                  填写优惠信息，系统会在截止日期前提醒您
                </DialogDescription>
              </DialogHeader>
              <CouponForm onSubmit={handleAddCoupon} onCancel={() => setIsAddDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto p-4 pb-24">
        {/* WebDAV 配置区域 */}
        {!isWebDAVConfigured && (
          <div className="mb-6">
            <WebDAVConfig />
          </div>
        )}

        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {coupons.filter((c) => !isExpired(c.endDate)).length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">有效优惠</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {coupons.filter((c) => isExpiringSoon(c.endDate) && !isExpired(c.endDate)).length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">即将到期</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {coupons.filter((c) => isExpired(c.endDate)).length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">已过期</div>
          </Card>
        </div>

        {/* 优惠券列表 */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : !isWebDAVConfigured ? (
          <Card className="p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Calendar className="h-16 w-16 mx-auto mb-4" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              请先配置 WebDAV
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              配置 WebDAV 后即可开始使用优惠券管理功能
            </p>
          </Card>
        ) : coupons.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Calendar className="h-16 w-16 mx-auto mb-4" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              暂无优惠券
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              点击右上角"添加"按钮开始记录您的优惠信息
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* 即将到期提示 */}
            {coupons.filter((c) => isExpiringSoon(c.endDate) && !isExpired(c.endDate) && !c.isReminded).length > 0 && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                      即将到期的优惠券
                    </h4>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      您有{" "}
                      {coupons.filter(
                        (c) => isExpiringSoon(c.endDate) && !isExpired(c.endDate) && !c.isReminded
                      ).length}{" "}
                      张优惠券将在7天内到期，请尽快使用！
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 优惠券卡片 */}
            {coupons.map((coupon) => {
              const daysRemaining = getDaysRemaining(coupon.endDate)
              const expired = isExpired(coupon.endDate)
              const expiringSoon = isExpiringSoon(coupon.endDate) && !expired

              return (
                <Card
                  key={coupon.id}
                  className={`p-4 ${
                    expired
                      ? "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800"
                      : expiringSoon
                      ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
                      : "bg-white dark:bg-gray-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {coupon.title}
                        </h3>
                        {coupon.discountAmount && (
                          <Badge variant="secondary">{coupon.discountAmount}折</Badge>
                        )}
                        {expired && (
                          <Badge variant="destructive">已过期</Badge>
                        )}
                        {expiringSoon && !expired && (
                          <Badge className="bg-orange-500">即将到期</Badge>
                        )}
                        {coupon.isReminded && (
                          <Badge variant="outline" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            已提醒
                          </Badge>
                        )}
                      </div>
                      {coupon.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                          {coupon.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            截止：{new Date(coupon.endDate).toLocaleDateString("zh-CN")}
                          </span>
                        </div>
                        {daysRemaining >= 0 && (
                          <span className="text-gray-900 dark:text-white font-medium">
                            {daysRemaining === 0 ? "今天到期" : `剩余${daysRemaining}天`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!coupon.isReminded && !expired && expiringSoon && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleMarkReminded(coupon.id)}
                          disabled={isReminding === coupon.id}
                          className="text-orange-600 hover:text-orange-700 dark:text-orange-400"
                        >
                          <Bell className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingCoupon(coupon)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>
                              您确定要删除这个优惠券吗？此操作无法撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteCoupon(coupon.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* 编辑对话框 */}
      {editingCoupon && (
        <Dialog open={!!editingCoupon} onOpenChange={() => setEditingCoupon(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>编辑优惠券</DialogTitle>
              <DialogDescription>修改优惠券信息</DialogDescription>
            </DialogHeader>
            <CouponForm
              coupon={editingCoupon}
              onSubmit={(data) => handleUpdateCoupon(editingCoupon.id, data)}
              onCancel={() => setEditingCoupon(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
