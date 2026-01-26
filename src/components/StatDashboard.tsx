"use client"

import { useMemo } from "react"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Coupon } from "@/storage/database/shared/schema"

interface StatDashboardProps {
  coupons: Coupon[]
}

interface StoreSavings {
  name: string
  amount: number
  usedCount: number
}

interface CategoryData {
  name: string
  value: number
  count: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export default function StatDashboard({ coupons }: StatDashboardProps) {
  // 1. 总优惠金额统计
  const totalSavings = useMemo(() => {
    return coupons.reduce((sum, coupon) => {
      const discountAmount = coupon.discountAmount ?? 0
      return sum + discountAmount
    }, 0)
  }, [coupons])

  const usedSavings = useMemo(() => {
    return coupons.reduce((sum, coupon) => {
      const discountAmount = coupon.discountAmount ?? 0
      const isUsed = (coupon as any).isUsed ?? false
      return isUsed ? sum + discountAmount : sum
    }, 0)
  }, [coupons])

  const unusedSavings = totalSavings - usedSavings

  // 2. 状态统计（已使用/未使用/已过期）
  const statusStats = useMemo(() => {
    const now = new Date()
    return {
      total: coupons.length,
      used: coupons.filter(c => (c as any).isUsed).length,
      unused: coupons.filter(c => !(c as any).isUsed && new Date(c.endDate) > now).length,
      expired: coupons.filter(c => !(c as any).isUsed && new Date(c.endDate) <= now).length,
    }
  }, [coupons])

  // 3. 按分类统计（从标题中提取店铺名称）
  const categoryStats = useMemo(() => {
    const storeMap = new Map<string, { amount: number; count: number }>()

    coupons.forEach(coupon => {
      const discountAmount = coupon.discountAmount ?? 0
      const isUsed = (coupon as any).isUsed ?? false

      // 从标题中提取店铺名称
      let storeName = "其他"
      const commonStores = [
        "淘宝", "天猫", "京东", "拼多多", "美团", "饿了么",
        "盒马", "山姆", "Costco", "永辉", "大润发", "家乐福",
        "沃尔玛", "优衣库", "ZARA", "H&M", "Nike", "Adidas",
        "星巴克", "喜茶", "奈雪", "瑞幸", "肯德基", "麦当劳",
        "海底捞", "小龙坎", "蜜雪冰城", "云闪付", "一鸣", "古茗",
        "立减金"
      ]

      for (const store of commonStores) {
        if (coupon.title.includes(store)) {
          storeName = store
          break
        }
      }

      // 如果没有匹配到预设名称，取空格之前的部分
      if (storeName === "其他") {
        const firstSpaceIndex = coupon.title.indexOf(' ')
        if (firstSpaceIndex > 0) {
          storeName = coupon.title.substring(0, firstSpaceIndex)
        } else if (coupon.title.length > 0) {
          storeName = coupon.title
        }
      }

      const existing = storeMap.get(storeName) || { amount: 0, count: 0 }
      existing.amount += discountAmount
      existing.count += 1
      storeMap.set(storeName, existing)
    })

    // 转换为数组并排序
    const data: CategoryData[] = Array.from(storeMap.entries())
      .map(([name, { amount, count }]) => ({ name, value: amount, count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8) // 只取前8个

    return data
  }, [coupons])

  // 4. 节省金额排行榜（按店铺）
  const storeSavings = useMemo(() => {
    const storeMap = new Map<string, StoreSavings>()

    coupons.forEach(coupon => {
      const discountAmount = coupon.discountAmount ?? 0
      const isUsed = (coupon as any).isUsed ?? false

      // 从标题中提取店铺名称
      let storeName = "其他"
      const commonStores = [
        "淘宝", "天猫", "京东", "拼多多", "美团", "饿了么",
        "盒马", "山姆", "Costco", "永辉", "大润发", "家乐福",
        "沃尔玛", "优衣库", "ZARA", "H&M", "Nike", "Adidas",
        "星巴克", "喜茶", "奈雪", "瑞幸", "肯德基", "麦当劳",
        "海底捞", "小龙坎", "蜜雪冰城", "云闪付", "一鸣", "古茗",
        "立减金"
      ]

      for (const store of commonStores) {
        if (coupon.title.includes(store)) {
          storeName = store
          break
        }
      }

      // 如果没有匹配到预设名称，取空格之前的部分
      if (storeName === "其他") {
        const firstSpaceIndex = coupon.title.indexOf(' ')
        if (firstSpaceIndex > 0) {
          storeName = coupon.title.substring(0, firstSpaceIndex)
        } else if (coupon.title.length > 0) {
          storeName = coupon.title
        }
      }

      const existing = storeMap.get(storeName) || { name: storeName, amount: 0, usedCount: 0 }
      existing.amount += discountAmount
      if (isUsed) {
        existing.usedCount += 1
      }
      storeMap.set(storeName, existing)
    })

    // 转换为数组并排序（按节省金额）
    return Array.from(storeMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10) // 只取前10个
  }, [coupons])

  if (coupons.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>统计分析</CardTitle>
          <CardDescription>暂无优惠券数据</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            添加优惠券后即可查看统计分析
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* 总优惠金额统计 */}
      <Card>
        <CardHeader>
          <CardTitle>总优惠金额</CardTitle>
          <CardDescription>所有优惠券的优惠金额汇总</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                ¥{totalSavings.toFixed(0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">总计</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                ¥{usedSavings.toFixed(0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">已使用</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                ¥{unusedSavings.toFixed(0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">待使用</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 状态统计 */}
      <Card>
        <CardHeader>
          <CardTitle>状态统计</CardTitle>
          <CardDescription>优惠券使用情况分布</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold">{statusStats.used}</div>
                <div className="text-xs text-muted-foreground">已使用</div>
              </div>
              <Badge className="bg-green-500">已使用</Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold">{statusStats.unused}</div>
                <div className="text-xs text-muted-foreground">未使用</div>
              </div>
              <Badge className="bg-blue-500">未使用</Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold">{statusStats.expired}</div>
                <div className="text-xs text-muted-foreground">已过期</div>
              </div>
              <Badge variant="destructive">已过期</Badge>
            </div>
          </div>

          {/* 饼图 */}
          <div className="mt-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={[
                    { name: '已使用', value: statusStats.used },
                    { name: '未使用', value: statusStats.unused },
                    { name: '已过期', value: statusStats.expired },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#3b82f6" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 按分类统计 */}
      <Card>
        <CardHeader>
          <CardTitle>按店铺统计</CardTitle>
          <CardDescription>各店铺优惠金额分布</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `¥${value}`} />
                <Legend />
                <Bar dataKey="value" fill="#3b82f6" name="优惠金额(元)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 节省金额排行榜 */}
      <Card>
        <CardHeader>
          <CardTitle>节省金额排行榜</CardTitle>
          <CardDescription>各店铺节省金额TOP 10</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {storeSavings.map((store, index) => (
              <div
                key={store.name}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{store.name}</div>
                    <div className="text-xs text-muted-foreground">
                      已使用 {store.usedCount} 张
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    ¥{store.amount.toFixed(0)}
                  </div>
                  <div className="text-xs text-muted-foreground">节省金额</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
