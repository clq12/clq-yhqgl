"use client"

import { useEffect, useState } from "react"
import { Plus, Bell, Calendar, Trash2, Edit, CheckCircle, XCircle, AlertCircle, Info, Settings, Check, BarChart3, CheckSquare, XSquare, Clock, Trash, ChevronDown, ScanText, Download, Upload as ImportIcon, Loader2, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import StatDashboard from "@/components/StatDashboard"
import BatchOcrRecognizer, { type ExtractedCouponInfo } from "@/components/BatchOcrRecognizer"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Coupon } from "@/lib/webdav-storage"

interface RemindStatusItem {
  id: string
  title: string
  endDate: string
  daysRemaining: number
  remainingTimeText: string
  isReminded: boolean
  remindedDays: number[]
  willRemind: boolean
  remindDays: number[]
  reason?: string
}

export default function Home() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [isReminding, setIsReminding] = useState<string | null>(null)
  const [isWebDAVConfigured, setIsWebDAVConfigured] = useState(false)
  const [checkingConfig, setCheckingConfig] = useState(true)
  const [isRemindStatusOpen, setIsRemindStatusOpen] = useState(false)
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false)
  const [remindStatus, setRemindStatus] = useState<RemindStatusItem[]>([])
  const [loadingRemindStatus, setLoadingRemindStatus] = useState(false)
  const [sortBy, setSortBy] = useState<'discount' | 'remaining' | 'name' | null>('remaining')
  const [sortByOrder, setSortByOrder] = useState<'asc' | 'desc'>('asc')
  const [filterExpiring, setFilterExpiring] = useState<'1day' | '3day' | '7day' | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<'valid' | 'expiring' | 'expired' | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [isStatDialogOpen, setIsStatDialogOpen] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isAddingMode, setIsAddingMode] = useState(false)
  const [isBatchOcrDialogOpen, setIsBatchOcrDialogOpen] = useState(false)
  const [exportFilter, setExportFilter] = useState<'all' | 'used' | 'unused' | 'expired'>('all')
  const [importMode, setImportMode] = useState<'merge' | 'skip' | 'overwrite'>('merge')
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [usedCouponsExpanded, setUsedCouponsExpanded] = useState(false)  // 已使用优惠券展开状态
  const [isPushing, setIsPushing] = useState(false)  // 推送状态
  const [pushMessage, setPushMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

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

  // 获取提醒状态
  const fetchRemindStatus = async () => {
    try {
      setLoadingRemindStatus(true)
      const response = await fetch("/api/remind-status")
      const result = await response.json()
      if (result.success) {
        setRemindStatus(result.data.statusList)
      }
    } catch (error) {
      console.error("获取提醒状态失败:", error)
    } finally {
      setLoadingRemindStatus(false)
    }
  }

  // 处理批量OCR识别结果
  const handleBatchOcrExtracted = async (infos: ExtractedCouponInfo[]) => {
    if (infos.length === 0) {
      alert("未能识别到任何优惠券信息")
      return
    }

    // 先关闭对话框
    setIsBatchOcrDialogOpen(false)

    try {
      const response = await fetch("/api/coupons/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupons: infos }),
      })

      const result = await response.json()

      if (result.success) {
        await fetchCoupons()
        alert(`成功添加 ${result.data.addedCount} 个优惠券`)
      } else {
        console.error('批量添加失败:', result.error)
        alert(`添加失败：${result.error}`)
      }
    } catch (error) {
      console.error("批量添加优惠券失败:", error)
      alert("批量添加失败，请检查网络连接")
    }
  }

  // 导出优惠券
  const handleExportCoupons = async (filter: 'all' | 'used' | 'unused' | 'expired') => {
    try {
      const response = await fetch("/api/coupons/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter }),
      })
      const result = await response.json()

      if (result.success) {
        // 创建Blob并下载
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = result.filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        setIsExportDialogOpen(false)
        alert(`成功导出 ${result.data.exportCount} 个优惠券`)
      } else {
        alert(`导出失败：${result.error}`)
      }
    } catch (error) {
      console.error("导出优惠券失败:", error)
      alert("导出失败")
    }
  }

  // 导入优惠券
  const handleImportCoupons = async (file: File, mode: 'merge' | 'skip' | 'overwrite') => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.coupons || !Array.isArray(data.coupons)) {
        alert("文件格式错误，未找到优惠券数据")
        return
      }

      const response = await fetch("/api/coupons/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupons: data.coupons, mode }),
      })
      const result = await response.json()

      if (result.success) {
        setIsImportDialogOpen(false)
        fetchCoupons()
        alert(result.message)
      } else {
        alert(`导入失败：${result.error}`)
      }
    } catch (error) {
      console.error("导入优惠券失败:", error)
      alert("导入失败，请检查文件格式")
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
        setIsFormDialogOpen(false)
        setIsAddingMode(false)
        setEditingCoupon(null)
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
        setIsFormDialogOpen(false)
        setIsAddingMode(false)
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

  // 批量操作：切换选中状态
  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  // 批量操作：全选/取消全选
  const toggleAllSelection = () => {
    const currentCoupons = getFilteredAndSortedCoupons()
    if (selectedIds.length === currentCoupons.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(currentCoupons.map(c => c.id))
    }
  }

  // 批量操作：标记已使用
  const handleBulkMarkUsed = async (isUsed: boolean) => {
    if (selectedIds.length === 0) return

    try {
      const response = await fetch("/api/coupons/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          action: "markUsed",
          isUsed,
        }),
      })

      const result = await response.json()
      if (result.success) {
        setSelectedIds([])
        setIsBulkMode(false)
        fetchCoupons()
      }
    } catch (error) {
      console.error("批量操作失败:", error)
      alert("批量操作失败")
    }
  }

  // 批量操作：删除
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return

    if (!confirm(`确定要删除选中的 ${selectedIds.length} 个优惠券吗？`)) {
      return
    }

    try {
      const response = await fetch("/api/coupons/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          action: "delete",
        }),
      })

      const result = await response.json()
      if (result.success) {
        setSelectedIds([])
        setIsBulkMode(false)
        fetchCoupons()
      }
    } catch (error) {
      console.error("批量删除失败:", error)
      alert("批量删除失败")
    }
  }

  // 批量操作：修改截止时间
  const handleBulkExtend = async (days: number) => {
    if (selectedIds.length === 0) return

    try {
      const response = await fetch("/api/coupons/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          action: "extend",
          days,
        }),
      })

      const result = await response.json()
      if (result.success) {
        setSelectedIds([])
        setIsBulkMode(false)
        fetchCoupons()
      }
    } catch (error) {
      console.error("批量修改失败:", error)
      alert("批量修改失败")
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

  // 标记为已使用
  const handleMarkUsed = async (id: string, isUsed: boolean) => {
    try {
      const response = await fetch(`/api/coupons/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isUsed }),
      })
      const result = await response.json()
      if (result.success) {
        fetchCoupons()
      }
    } catch (error) {
      console.error("标记使用状态失败:", error)
    }
  }

  // 立即推送
  const handleImmediatePush = async () => {
    setIsPushing(true)
    setPushMessage(null)

    try {
      const response = await fetch("/api/check-expiring")
      const result = await response.json()

      if (result.success) {
        setPushMessage({
          type: 'success',
          text: `推送成功！已发送 ${result.data?.totalSent || 0} 条提醒`
        })
        fetchCoupons() // 刷新优惠券列表以更新提醒状态
      } else {
        setPushMessage({
          type: 'error',
          text: result.error || '推送失败，请检查配置'
        })
      }
    } catch (error) {
      console.error("推送失败:", error)
      setPushMessage({
        type: 'error',
        text: '推送失败，请检查网络和配置'
      })
    } finally {
      setIsPushing(false)
      // 3秒后自动隐藏消息
      setTimeout(() => setPushMessage(null), 3000)
    }
  }

  // 显示折扣信息
  const getDiscountText = (coupon: Coupon) => {
    const discountType = (coupon as any).discountType
    const discountAmount = coupon.discountAmount
    const fullAmount = (coupon as any).fullAmount

    if (!discountType || !discountAmount) return null

    switch (discountType) {
      case 'amount':
        return `减${discountAmount}元`
      case 'percentage':
        return `${discountAmount}折`
      case 'full':
        return `满${fullAmount}减${discountAmount}`
      default:
        return null
    }
  }

  // 计算折扣率（用于排序）
  const getDiscountRate = (coupon: Coupon): number => {
    const discountType = (coupon as any).discountType
    const discountAmount = coupon.discountAmount
    const fullAmount = (coupon as any).fullAmount

    if (!discountType || !discountAmount) return 0

    switch (discountType) {
      case 'amount':
        // 减免金额类型：假设满100可用，计算折扣率
        // 实际应用中可能需要根据具体情况调整这个阈值
        const assumedAmount = 100
        return discountAmount / assumedAmount
      case 'percentage':
        // 折扣类型：8折 = 实际支付80%，折扣率 = 20%
        return (100 - discountAmount) / 100
      case 'full':
        // 满减类型：满2000减5 = 0.25%
        if (!fullAmount) return 0
        return discountAmount / fullAmount
      default:
        return 0
    }
  }

  // 计算剩余天数和小时数（考虑endHour和endMinute，使用北京时间 UTC+8）
  const getDaysRemaining = (coupon: Coupon) => {
    const now = new Date()
    
    // 验证截止日期是否存在
    if (!coupon.endDate) {
      return 0
    }
    
    // 解析截止日期
    let endDate: Date
    
    // 检查日期是否已经包含时间部分（完整的ISO格式）
    if (coupon.endDate.includes('T') || coupon.endDate.includes(' ')) {
      // 完整ISO格式，直接使用
      endDate = new Date(coupon.endDate)
    } else {
      // 纯日期格式，添加时间部分
      endDate = new Date(coupon.endDate + 'T00:00:00Z')
      
      // 获取截止时间的小时和分钟（只对纯日期格式添加）
      const endHour = (coupon as any).endHour ?? 23
      const endMinute = (coupon as any).endMinute ?? 59
      
      // 设置截止时间（UTC时间）
      // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
      let utcHour = endHour - 8
      if (utcHour < 0) {
        utcHour += 24
        endDate.setDate(endDate.getDate() - 1)
      }
      endDate.setUTCHours(utcHour, endMinute, 0, 0)
    }
    
    // 验证日期解析是否成功
    if (isNaN(endDate.getTime())) {
      console.error(`无效的截止日期: ${coupon.endDate}`)
      return 0
    }
    
    // 当前时间（UTC）
    const nowUTC = now.getTime()
    
    // 截止时间（UTC）
    const endTimeUTC = endDate.getTime()
    
    const diff = endTimeUTC - nowUTC
    
    // 验证计算结果是否有效
    if (isNaN(diff) || !isFinite(diff)) {
      return 0
    }
    
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return days
  }

  // 获取剩余小时数（用于更精确的排序，使用北京时间 UTC+8）
  const getRemainingHours = (coupon: Coupon) => {
    const now = new Date()
    
    // 验证截止日期是否存在
    if (!coupon.endDate) {
      console.error(`优惠券 "${coupon.title}" 没有截止日期`)
      return 0
    }
    
    // 解析截止日期
    let endDate: Date
    
    // 检查日期是否已经包含时间部分（完整的ISO格式）
    if (coupon.endDate.includes('T') || coupon.endDate.includes(' ')) {
      // 完整ISO格式，直接使用
      endDate = new Date(coupon.endDate)
    } else {
      // 纯日期格式，添加时间部分
      endDate = new Date(coupon.endDate + 'T00:00:00Z')
      
      // 获取截止时间的小时和分钟（只对纯日期格式添加）
      const endHour = (coupon as any).endHour ?? 23
      const endMinute = (coupon as any).endMinute ?? 59
      
      // 设置截止时间（UTC时间）
      // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
      let utcHour = endHour - 8
      if (utcHour < 0) {
        utcHour += 24
        endDate.setDate(endDate.getDate() - 1)
      }
      endDate.setUTCHours(utcHour, endMinute, 0, 0)
    }
    
    // 验证日期解析是否成功
    if (isNaN(endDate.getTime())) {
      console.error(`无效的截止日期: ${coupon.endDate}`)
      return 0
    }
    
    // 当前时间（UTC）
    const nowUTC = now.getTime()
    
    // 截止时间（UTC）
    const endTimeUTC = endDate.getTime()
    
    const diff = endTimeUTC - nowUTC
    
    // 验证计算结果是否有效
    if (isNaN(diff) || !isFinite(diff)) {
      console.error(`无效的时间差: diff=${diff}`)
      return 0
    }
    
    const diffHours = diff / (1000 * 60 * 60)
    return Math.max(0, diffHours) // 返回小时数，最小为0
  }

  // 获取精确到小时的剩余时间文本（使用北京时间 UTC+8）
  const getRemainingTimeText = (coupon: Coupon) => {
    const now = new Date()
    
    // 验证截止日期是否存在
    if (!coupon.endDate) {
      return "截止日期无效"
    }
    
    // 解析截止日期
    let endDate: Date
    
    // 检查日期是否已经包含时间部分（完整的ISO格式）
    if (coupon.endDate.includes('T') || coupon.endDate.includes(' ')) {
      endDate = new Date(coupon.endDate)
    } else {
      // 纯日期格式，添加时间部分
      endDate = new Date(coupon.endDate + 'T00:00:00Z')
    }
    
    // 验证日期解析是否成功
    if (isNaN(endDate.getTime())) {
      console.error(`无效的截止日期: ${coupon.endDate}`)
      return "截止日期无效"
    }
    
    // 获取截止时间的小时和分钟
    const endHour = (coupon as any).endHour
    const endMinute = (coupon as any).endMinute ?? 59
    
    // 设置截止时间（UTC时间）
    // UTC+8的小时 = endHour，所以UTC时间应该是 endHour - 8
    let utcHour = (endHour ?? 23) - 8
    if (utcHour < 0) {
      utcHour += 24
      endDate.setDate(endDate.getDate() - 1)
    }
    endDate.setUTCHours(utcHour, endMinute, 0, 0)
    
    // 当前时间（UTC）
    const nowUTC = now.getTime()
    
    // 截止时间（UTC）
    const endTimeUTC = endDate.getTime()
    
    // 验证时间戳是否有效
    if (isNaN(nowUTC) || isNaN(endTimeUTC)) {
      console.error(`无效的时间戳: nowUTC=${nowUTC}, endTimeUTC=${endTimeUTC}`)
      return "时间计算错误"
    }
    
    const diff = endTimeUTC - nowUTC
    const totalHours = diff / (1000 * 60 * 60)

    // 验证计算结果是否有效
    if (isNaN(totalHours) || !isFinite(totalHours)) {
      console.error(`无效的总小时数: totalHours=${totalHours}, diff=${diff}`)
      return "时间计算错误"
    }

    if (totalHours < 0) {
      return "已过期"
    }

    const days = Math.floor(totalHours / 24)
    const hours = Math.floor(totalHours % 24)

    if (days === 0) {
      return `${hours}小时后到期`
    } else if (hours === 0) {
      return `${days}天后到期`
    } else {
      return `${days}天${hours}小时后到期`
    }
  }

  // 判断是否即将到期（7天内）
  const isExpiringSoon = (coupon: Coupon) => {
    const days = getDaysRemaining(coupon)
    return days <= 7 && days >= 0
  }

  // 判断是否已过期
  const isExpired = (coupon: Coupon) => {
    const days = getDaysRemaining(coupon)
    return days < 0
  }

  // 获取提醒状态描述
  const getRemindStatus = (coupon: Coupon) => {
    if (!coupon.isReminded) {
      return { text: "未提醒", color: "gray" }
    }

    const remindedDays = (coupon as any).remindedDays || []
    if (remindedDays.length === 0) {
      return { text: "已提醒", color: "green" }
    }

    const dayText = remindedDays.sort((a: number, b: number) => a - b).join("天、")
    return { text: `已提醒（${dayText}天）`, color: "blue" }
  }

  // 应用排序和筛选
  const getFilteredAndSortedCoupons = () => {
    let result = [...coupons]

    // 先应用排序（对所有优惠券排序）
    if (sortBy) {
      result.sort((a, b) => {
        if (sortBy === 'discount') {
          // 使用折扣率而不是直接比较金额
          const aDiscount = getDiscountRate(a)
          const bDiscount = getDiscountRate(b)
          return sortByOrder === 'asc' ? aDiscount - bDiscount : bDiscount - aDiscount
        } else if (sortBy === 'remaining') {
          const aHours = getRemainingHours(a)
          const bHours = getRemainingHours(b)
          return sortByOrder === 'asc' ? aHours - bHours : bHours - aHours
        } else if (sortBy === 'name') {
          return sortByOrder === 'asc'
            ? a.title.localeCompare(b.title)
            : b.title.localeCompare(a.title)
        }
        return 0
      })
    }

    // 再应用搜索（不影响排序顺序）
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(c => {
        // 搜索标题、描述和备注
        const title = c.title.toLowerCase()
        const description = (c.description || '').toLowerCase()
        const notes = (c.notes || '').toLowerCase()
        const discountText = c.discountType === 'percentage'
          ? `${c.discountAmount}%折扣`
          : c.discountType === 'amount'
            ? `减免${c.discountAmount}元`
            : c.discountType === 'full'
              ? `满减`
              : ''

        return title.includes(query) ||
               description.includes(query) ||
               notes.includes(query) ||
               discountText.includes(query)
      })
    }

    // 再应用筛选（不影响排序顺序）
    if (filterExpiring !== 'all') {
      const days = filterExpiring === '1day' ? 1 : filterExpiring === '3day' ? 3 : 7
      result = result.filter(c => {
        const remaining = getDaysRemaining(c)
        return remaining >= 0 && remaining <= days
      })
    }

    // 应用状态筛选（有效/即将到期/已过期）
    if (filterStatus) {
      result = result.filter(c => {
        if (filterStatus === 'valid') {
          return !isExpired(c) && !(c as any).isUsed
        } else if (filterStatus === 'expiring') {
          return isExpiringSoon(c) && !isExpired(c) && !(c as any).isUsed
        } else if (filterStatus === 'expired') {
          return isExpired(c) && !(c as any).isUsed
        }
        return true
      })
    }

    // 最后将优惠券按使用状态和过期状态分组，同时保持每组内部的排序顺序
    // 顺序：未使用未过期 → 未使用已过期 → 已使用未过期 → 已使用已过期
    const unusedNotExpired = result.filter(c => !(c as any).isUsed && !isExpired(c))
    const unusedExpired = result.filter(c => !(c as any).isUsed && isExpired(c))
    const usedNotExpired = result.filter(c => (c as any).isUsed && !isExpired(c))
    const usedExpired = result.filter(c => (c as any).isUsed && isExpired(c))
    
    return [...unusedNotExpired, ...unusedExpired, ...usedNotExpired, ...usedExpired]
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
          <div className="flex gap-2">
            {/* 设置按钮 */}
            <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant={isWebDAVConfigured ? "outline" : "default"}
                  className="rounded-full gap-2"
                >
                  {isWebDAVConfigured ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Settings className="h-4 w-4" />
                  )}
                  {isWebDAVConfigured ? "已配置" : "配置"}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>WebDAV 配置</DialogTitle>
                  <DialogDescription>
                    {isWebDAVConfigured
                      ? "查看和管理 WebDAV 配置"
                      : "配置 WebDAV 服务以存储优惠券数据"}
                  </DialogDescription>
                </DialogHeader>
                <WebDAVConfig />
              </DialogContent>
            </Dialog>

            <Dialog open={isRemindStatusOpen} onOpenChange={setIsRemindStatusOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full gap-2"
                  disabled={!isWebDAVConfigured}
                  onClick={fetchRemindStatus}
                >
                  <Bell className="h-4 w-4" />
                  提醒状态
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>提醒状态</DialogTitle>
                  <DialogDescription>
                    查看所有优惠券的推送提醒状态
                  </DialogDescription>
                </DialogHeader>
                {loadingRemindStatus ? (
                  <div className="text-center py-8">加载中...</div>
                ) : remindStatus.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">暂无优惠券</div>
                ) : (
                  <div className="space-y-3">
                    {remindStatus.map((status) => (
                      <div
                        key={status.id}
                        className="border rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h4 className="font-semibold mb-1">{status.title}</h4>
                            <div className="text-sm text-gray-500 space-y-1">
                              <div>到期时间：{new Date(status.endDate).toLocaleDateString('zh-CN')}</div>
                              <div>剩余天数：<span className={status.daysRemaining <= 3 ? 'text-orange-600 font-medium' : ''}>{status.daysRemaining}天</span></div>
                              {status.remindedDays.length > 0 && (
                                <div>已提醒：<span className="text-blue-600">{status.remindedDays.join('天、')}天</span></div>
                              )}
                            </div>
                          </div>
                          <div>
                            {status.willRemind ? (
                              <Badge className="bg-green-500">
                                将提醒（{status.remindDays.join('、')}天）
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-gray-500">
                                {status.reason}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* 添加优惠券按钮 */}
            <Button
              size="sm"
              className="rounded-full gap-2"
              disabled={!isWebDAVConfigured}
              onClick={() => {
                setIsAddingMode(true)
                setEditingCoupon(null)
                setIsFormDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              添加
            </Button>

            {/* 批量OCR识别按钮 */}
            <Dialog open={isBatchOcrDialogOpen} onOpenChange={setIsBatchOcrDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full gap-2"
                  disabled={!isWebDAVConfigured}
                >
                  <ScanText className="h-4 w-4" />
                  批量OCR
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>批量识别优惠券</DialogTitle>
                  <DialogDescription>
                    一次选择多张优惠券图片，自动识别并批量添加
                  </DialogDescription>
                </DialogHeader>
                <BatchOcrRecognizer
                  onBatchExtracted={handleBatchOcrExtracted}
                  onCancel={() => setIsBatchOcrDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>

            {/* 导出按钮 */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full gap-2"
                  disabled={!isWebDAVConfigured || coupons.length === 0}
                >
                  <Download className="h-4 w-4" />
                  导出
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>导出优惠券</DialogTitle>
                  <DialogDescription>
                    选择要导出的优惠券类型
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">导出范围</label>
                    <Select value={exportFilter} onValueChange={(value: any) => setExportFilter(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部优惠券 ({coupons.length})</SelectItem>
                        <SelectItem value="unused">未使用 ({coupons.filter((c: any) => !(c as any).isUsed && !isExpired(c)).length})</SelectItem>
                        <SelectItem value="used">已使用 ({coupons.filter((c: any) => (c as any).isUsed).length})</SelectItem>
                        <SelectItem value="expired">已过期 ({coupons.filter((c: any) => isExpired(c)).length})</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={() => handleExportCoupons(exportFilter)} className="gap-2">
                      <Download className="h-4 w-4" />
                      导出JSON
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* 导入按钮 */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full gap-2"
                  disabled={!isWebDAVConfigured}
                >
                  <ImportIcon className="h-4 w-4" />
                  导入
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>导入优惠券</DialogTitle>
                  <DialogDescription>
                    选择要导入的JSON文件
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">导入模式</label>
                    <Select value={importMode} onValueChange={(value: any) => setImportMode(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merge">合并模式 - 导入所有优惠券</SelectItem>
                        <SelectItem value="skip">跳过模式 - 跳过重复项</SelectItem>
                        <SelectItem value="overwrite">覆盖模式 - 覆盖重复项</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      {importMode === 'merge' && '导入所有优惠券，包括重复的'}
                      {importMode === 'skip' && '跳过与现有优惠券重复的项'}
                      {importMode === 'overwrite' && '覆盖与现有优惠券重复的项'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">选择文件</label>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleImportCoupons(file, importMode)
                        }
                      }}
                      className="block w-full text-sm text-gray-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-blue-50 file:text-blue-700
                        hover:file:bg-blue-100"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* 统计分析按钮 */}
            <Dialog open={isStatDialogOpen} onOpenChange={setIsStatDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full gap-2"
                  disabled={!isWebDAVConfigured || coupons.length === 0}
                >
                  <BarChart3 className="h-4 w-4" />
                  统计
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>统计分析</DialogTitle>
                  <DialogDescription>
                    查看优惠券使用情况和节省金额
                  </DialogDescription>
                </DialogHeader>
                <StatDashboard coupons={coupons} />
              </DialogContent>
            </Dialog>

            {/* 批量操作模式按钮 */}
            <Button
              size="sm"
              variant={isBulkMode ? "default" : "outline"}
              className="rounded-full gap-2"
              onClick={() => {
                setIsBulkMode(!isBulkMode)
                setSelectedIds([])
              }}
              disabled={!isWebDAVConfigured || coupons.length === 0}
            >
              {isBulkMode ? <XSquare className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
              {isBulkMode ? "退出" : "批量"}
            </Button>
          </div>
        </div>
      </div>

      {/* 批量操作栏 */}
      {isBulkMode && selectedIds.length > 0 && (
        <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-lg border-b px-4 py-3 dark:bg-gray-900/95 dark:border-gray-800">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.length === getFilteredAndSortedCoupons().length}
                onChange={toggleAllSelection}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>已选择 <strong>{selectedIds.length}</strong> 个优惠券</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkMarkUsed(true)}
                className="gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                标记已使用
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkMarkUsed(false)}
                className="gap-2"
              >
                <XSquare className="h-4 w-4" />
                取消已使用
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkExtend(7)}
                className="gap-2"
              >
                <Clock className="h-4 w-4" />
                延长7天
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                className="gap-2"
              >
                <Trash className="h-4 w-4" />
                删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto p-4 pb-24">
        {/* 未配置提示 */}
        {!isWebDAVConfigured && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  请先配置 WebDAV
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                  点击右上角"配置"按钮设置 WebDAV 服务，用于存储优惠券数据
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card 
            className={`p-4 cursor-pointer transition-colors ${filterStatus === 'valid' ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            onClick={() => setFilterStatus(filterStatus === 'valid' ? null : 'valid')}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {coupons.filter((c) => !isExpired(c) && !(c as any).isUsed).length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">有效优惠</div>
              </div>
              <Filter className={`h-5 w-5 ${filterStatus === 'valid' ? 'text-blue-600' : 'text-gray-400'}`} />
            </div>
          </Card>
          <Card 
            className={`p-4 cursor-pointer transition-colors ${filterStatus === 'expiring' ? 'ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            onClick={() => setFilterStatus(filterStatus === 'expiring' ? null : 'expiring')}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {coupons.filter((c) => isExpiringSoon(c) && !isExpired(c) && !(c as any).isUsed).length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">即将到期</div>
              </div>
              <Filter className={`h-5 w-5 ${filterStatus === 'expiring' ? 'text-orange-600' : 'text-gray-400'}`} />
            </div>
          </Card>
          <Card 
            className={`p-4 cursor-pointer transition-colors ${filterStatus === 'expired' ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            onClick={() => setFilterStatus(filterStatus === 'expired' ? null : 'expired')}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {coupons.filter((c) => isExpired(c) && !(c as any).isUsed).length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">已过期</div>
              </div>
              <Filter className={`h-5 w-5 ${filterStatus === 'expired' ? 'text-red-600' : 'text-gray-400'}`} />
            </div>
          </Card>
        </div>

        {/* 排序和筛选工具栏 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 border">
          <div className="flex flex-wrap gap-3 items-center">
            {/* 搜索 */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[400px]">
              <Input
                type="text"
                placeholder="搜索优惠券..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm"
              />
              {searchQuery && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSearchQuery('')}
                  className="text-xs"
                >
                  清除
                </Button>
              )}
            </div>

            {/* 排序 */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">排序：</span>
              <Button
                size="sm"
                variant={sortBy === 'discount' ? 'default' : 'outline'}
                onClick={() => {
                  if (sortBy === 'discount') {
                    setSortByOrder(sortByOrder === 'asc' ? 'desc' : 'asc')
                  } else {
                    setSortBy('discount')
                    setSortByOrder('desc')
                  }
                }}
                className="text-xs"
              >
                折扣力度 {sortBy === 'discount' && (sortByOrder === 'asc' ? '↑' : '↓')}
              </Button>
              <Button
                size="sm"
                variant={sortBy === 'remaining' ? 'default' : 'outline'}
                onClick={() => {
                  if (sortBy === 'remaining') {
                    setSortByOrder(sortByOrder === 'asc' ? 'desc' : 'asc')
                  } else {
                    setSortBy('remaining')
                    setSortByOrder('asc')
                  }
                }}
                className="text-xs"
              >
                剩余时间 {sortBy === 'remaining' && (sortByOrder === 'asc' ? '↑' : '↓')}
              </Button>
              <Button
                size="sm"
                variant={sortBy === 'name' ? 'default' : 'outline'}
                onClick={() => {
                  if (sortBy === 'name') {
                    setSortByOrder(sortByOrder === 'asc' ? 'desc' : 'asc')
                  } else {
                    setSortBy('name')
                    setSortByOrder('asc')
                  }
                }}
                className="text-xs"
              >
                名称 {sortBy === 'name' && (sortByOrder === 'asc' ? '↑' : '↓')}
              </Button>
            </div>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>

            {/* 筛选 */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">筛选：</span>
              <Button
                size="sm"
                variant={filterExpiring === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterExpiring('all')}
                className="text-xs"
              >
                全部
              </Button>
              <Button
                size="sm"
                variant={filterExpiring === '1day' ? 'default' : 'outline'}
                onClick={() => setFilterExpiring('1day')}
                className="text-xs"
              >
                1天内
              </Button>
              <Button
                size="sm"
                variant={filterExpiring === '3day' ? 'default' : 'outline'}
                onClick={() => setFilterExpiring('3day')}
                className="text-xs"
              >
                3天内
              </Button>
              <Button
                size="sm"
                variant={filterExpiring === '7day' ? 'default' : 'outline'}
                onClick={() => setFilterExpiring('7day')}
                className="text-xs"
              >
                7天内
              </Button>
            </div>
          </div>
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
            {getFilteredAndSortedCoupons().filter((c) => isExpiringSoon(c) && !isExpired(c) && !c.isReminded && !(c as any).isUsed).length > 0 && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                      即将到期的优惠券
                    </h4>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      您有{" "}
                      {getFilteredAndSortedCoupons().filter(
                        (c) => isExpiringSoon(c) && !isExpired(c) && !c.isReminded && !(c as any).isUsed
                      ).length}{" "}
                      张优惠券将在7天内到期，请尽快使用！
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 未使用的优惠券 */}
            {getFilteredAndSortedCoupons().filter((c) => !(c as any).isUsed).map((coupon) => {
              const daysRemaining = getDaysRemaining(coupon)
              const expired = isExpired(coupon)
              const expiringSoon = isExpiringSoon(coupon) && !expired
              const endHour = (coupon as any).endHour
              const endMinute = (coupon as any).endMinute ?? 59
              const timeText = endHour !== null && endHour !== undefined
                ? `${new Date(coupon.endDate).toLocaleDateString("zh-CN")} ${endHour}:${endMinute.toString().padStart(2, '0')}`
                : `${new Date(coupon.endDate).toLocaleDateString("zh-CN")} 23:59`
              const discountText = getDiscountText(coupon)
              const remainingTimeText = getRemainingTimeText(coupon)

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
                  <div className="flex items-start gap-3">
                    {/* 批量选择复选框 */}
                    {isBulkMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(coupon.id)}
                        onChange={() => toggleSelection(coupon.id)}
                        className="h-4 w-4 mt-1 rounded border-gray-300"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className={`font-semibold truncate text-gray-900 dark:text-white`}>
                          {coupon.title}
                        </h3>
                        {discountText && (
                          <Badge variant="secondary">{discountText}</Badge>
                        )}
                        {expired && (
                          <Badge variant="destructive">已过期</Badge>
                        )}
                        {expiringSoon && !expired && (
                          <Badge className="bg-orange-500">即将到期</Badge>
                        )}
                        {coupon.isReminded && (
                          <Badge
                            variant="outline"
                            className={`gap-1 ${
                              ((coupon as any).remindedDays?.length || 0) > 1
                                ? "border-blue-500 text-blue-700 dark:text-blue-300"
                                : "border-green-500 text-green-700 dark:text-green-300"
                            }`}
                          >
                            <CheckCircle className="h-3 w-3" />
                            {getRemindStatus(coupon).text}
                          </Badge>
                        )}
                      </div>
                      {coupon.description && (
                        <p className="text-sm mb-3 line-clamp-2 text-gray-600 dark:text-gray-400">
                          {coupon.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            截止：{timeText}
                          </span>
                        </div>
                        {/* 统一使用剩余时间文本判断，而不是 daysRemaining */}
                        {remainingTimeText && remainingTimeText !== "已过期" && (
                          <span className="text-gray-900 dark:text-white font-medium">
                            {remainingTimeText}
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
                      {!expired && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleMarkUsed(coupon.id, true)}
                          className="text-green-600 hover:text-green-700 dark:text-green-400"
                          title="标记为已使用"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingCoupon(coupon)
                          setIsAddingMode(false)
                          setIsFormDialogOpen(true)
                        }}
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

            {/* 已使用的优惠券 */}
            {getFilteredAndSortedCoupons().filter((c) => (c as any).isUsed).length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUsedCouponsExpanded(!usedCouponsExpanded)}
                    className="gap-2"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${usedCouponsExpanded ? 'rotate-180' : ''}`} />
                    已使用的优惠券 ({coupons.filter((c) => (c as any).isUsed).length})
                  </Button>
                </div>

                {usedCouponsExpanded && (
                  <div className="space-y-4">
                    {coupons.filter((c) => (c as any).isUsed).map((coupon) => {
                      const endHour = (coupon as any).endHour
                      const endMinute = (coupon as any).endMinute ?? 59
                      const timeText = endHour !== null && endHour !== undefined
                        ? `${new Date(coupon.endDate).toLocaleDateString("zh-CN")} ${endHour}:${endMinute.toString().padStart(2, '0')}`
                        : `${new Date(coupon.endDate).toLocaleDateString("zh-CN")} 23:59`
                      const discountText = getDiscountText(coupon)

                      return (
                        <Card
                          key={coupon.id}
                          className="p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 opacity-75"
                        >
                          <div className="flex items-start gap-3">
                            {/* 批量选择复选框 */}
                            {isBulkMode && (
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(coupon.id)}
                                onChange={() => toggleSelection(coupon.id)}
                                className="h-4 w-4 mt-1 rounded border-gray-300"
                              />
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold truncate line-through text-gray-500 dark:text-gray-400">
                                  {coupon.title}
                                </h3>
                                {discountText && (
                                  <Badge variant="secondary">{discountText}</Badge>
                                )}
                                <Badge className="bg-green-500">已使用</Badge>
                              </div>
                              {coupon.description && (
                                <p className="text-sm mb-3 line-clamp-2 text-gray-500 dark:text-gray-400">
                                  {coupon.description}
                                </p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>截止：{timeText}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleMarkUsed(coupon.id, false)}
                                className="text-gray-600 hover:text-gray-700 dark:text-gray-400"
                                title="取消已使用"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingCoupon(coupon)
                                  setIsAddingMode(false)
                                  setIsFormDialogOpen(true)
                                }}
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
            )}
          </div>
        )}

        {/* 立即推送按钮 */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <Button
            onClick={handleImmediatePush}
            disabled={isPushing}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg shadow-lg"
          >
            {isPushing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                推送中...
              </>
            ) : (
              <>
                <Bell className="mr-2 h-5 w-5" />
                立即推送
              </>
            )}
          </Button>

          {/* 推送消息提示 */}
          {pushMessage && (
            <div
              className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-md ${
                pushMessage.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
              }`}
            >
              {pushMessage.type === 'success' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span className="text-sm font-medium">{pushMessage.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* 添加/编辑对话框 */}
      <Dialog
        open={isFormDialogOpen}
        onOpenChange={(open) => {
          setIsFormDialogOpen(open)
          if (!open) {
            setIsAddingMode(false)
            setEditingCoupon(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{isAddingMode ? '添加优惠券' : '编辑优惠券'}</DialogTitle>
            <DialogDescription>{isAddingMode ? '填写优惠信息，系统会在截止日期前提醒您' : '修改优惠券信息'}</DialogDescription>
          </DialogHeader>
          <CouponForm
            coupon={editingCoupon}
            onSubmit={isAddingMode
              ? handleAddCoupon
              : (data) => handleUpdateCoupon(editingCoupon!.id, data)
            }
            onCancel={() => {
              setIsFormDialogOpen(false)
              setIsAddingMode(false)
              setEditingCoupon(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 测试提醒对话框 */}
      <Dialog open={isRemindStatusOpen} onOpenChange={setIsRemindStatusOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>提醒状态</DialogTitle>
            <DialogDescription>
              查看所有优惠券的推送提醒状态
            </DialogDescription>
          </DialogHeader>

          {/* 提醒状态列表 */}
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Info className="h-4 w-4" />
              优惠券提醒状态
            </h4>
            {loadingRemindStatus ? (
              <div className="text-center py-8">加载中...</div>
            ) : remindStatus.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无优惠券</div>
            ) : (
              <div className="space-y-3">
                {remindStatus.map((status) => (
                  <div
                    key={status.id}
                    className="border rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="font-semibold mb-1">{status.title}</h4>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>到期时间：{new Date(status.endDate).toLocaleDateString('zh-CN')}</div>
                          <div>剩余：<span className={status.daysRemaining <= 3 ? 'text-orange-600 font-medium' : ''}>{status.remainingTimeText}</span></div>
                          {status.remindedDays.length > 0 && (
                            <div>已提醒：<span className="text-blue-600">{status.remindedDays.join('天、')}天</span></div>
                          )}
                        </div>
                      </div>
                      <div>
                        {status.willRemind ? (
                          <Badge className="bg-green-500">
                            将提醒（{status.remindDays.join('、')}天）
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">
                            {status.reason}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
