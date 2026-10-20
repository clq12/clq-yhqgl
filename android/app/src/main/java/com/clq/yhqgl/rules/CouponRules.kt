package com.clq.yhqgl.rules

import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.DiscountType
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * 优惠券业务规则（Kotlin 实现）
 * 与 shared/rules/coupon-rules.md 保持一致
 */
 object CouponRules {

    private val BEIJING_OFFSET = ZoneOffset.ofHours(8)
    private val DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE

    /**
     * 获取当前北京时间
     */
    fun beijingNow(): LocalDateTime = LocalDateTime.now(BEIJING_OFFSET)

    /**
     * 计算优惠券截止时间（UTC 时间戳，毫秒）
     */
    fun deadlineTimestamp(coupon: Coupon): Long {
        val date = LocalDate.parse(coupon.endDate, DATE_FORMAT)
        val hour = coupon.endHour ?: 23
        val minute = coupon.endMinute ?: 59
        val beijingDateTime = date.atTime(hour, minute, 59)
        return beijingDateTime.toInstant(BEIJING_OFFSET).toEpochMilli()
    }

    /**
     * 剩余小时数（可负数）
     */
    fun remainingHours(coupon: Coupon): Long {
        val nowUtc = System.currentTimeMillis()
        val deadline = deadlineTimestamp(coupon)
        return (deadline - nowUtc) / (1000 * 60 * 60)
    }

    /**
     * 剩余天数
     */
    fun remainingDays(coupon: Coupon): Long = remainingHours(coupon) / 24

    /**
     * 是否已过期
     */
    fun isExpired(coupon: Coupon): Boolean = remainingHours(coupon) < 0

    /**
     * 是否有效（未使用且未过期）
     */
    fun isActive(coupon: Coupon): Boolean = !coupon.isUsed && !isExpired(coupon)

    /**
     * 是否需要在指定天数内提醒
     */
    fun shouldRemindWithinDays(coupon: Coupon, days: Int): Boolean {
        if (coupon.isUsed) return false
        val hours = remainingHours(coupon)
        return hours >= 0 && hours < days * 24
    }

    /**
     * 获取当前应提醒的天数（返回 0 表示无需提醒）
     */
    fun currentRemindDays(coupon: Coupon, remindDays: List<Int>): Int {
        for (days in remindDays.sortedDescending()) {
            if (shouldRemindWithinDays(coupon, days) && !coupon.remindedDays.contains(days)) {
                return days
            }
        }
        return 0
    }

    /**
     * 验证优惠券字段
     */
    fun validate(coupon: Coupon): Result<Unit> {
        if (coupon.title.isBlank() || coupon.title.length > 255) {
            return Result.failure(IllegalArgumentException("标题不能为空且长度不超过255"))
        }
        val start = LocalDate.parse(coupon.startDate, DATE_FORMAT)
        val end = LocalDate.parse(coupon.endDate, DATE_FORMAT)
        if (end.isBefore(start)) {
            return Result.failure(IllegalArgumentException("截止日期不能早于开始日期"))
        }
        val hour = coupon.endHour ?: 23
        val minute = coupon.endMinute ?: 59
        if (hour !in 0..23 || minute !in 0..59) {
            return Result.failure(IllegalArgumentException("截止时间时分不合法"))
        }
        when (coupon.discountType) {
            DiscountType.FULL -> {
                if ((coupon.fullAmount ?: 0.0) <= 0 || (coupon.discountAmount ?: 0.0) <= 0) {
                    return Result.failure(IllegalArgumentException("满减优惠必须填写满金额和减免金额"))
                }
            }
            DiscountType.AMOUNT, DiscountType.PERCENTAGE -> {
                if ((coupon.discountAmount ?: 0.0) <= 0) {
                    return Result.failure(IllegalArgumentException("折扣金额必须大于0"))
                }
            }
            else -> { /* no-op */ }
        }
        return Result.success(Unit)
    }

    /**
     * 从标题提取店铺名
     */
    fun extractStore(title: String): String {
        val commonStores = listOf(
            "淘宝", "天猫", "京东", "拼多多", "美团", "饿了么", "盒马", "山姆", "Costco",
            "永辉", "大润发", "家乐福", "沃尔玛", "优衣库", "ZARA", "H&M", "Nike", "Adidas",
            "星巴克", "喜茶", "奈雪", "瑞幸", "肯德基", "麦当劳", "海底捞", "小龙坎",
            "蜜雪冰城", "云闪付", "一鸣", "古茗", "立减金", "小蚕", "库迪"
        )
        for (store in commonStores) {
            if (title.contains(store)) return store
        }
        val idx = title.indexOf(' ')
        return if (idx > 0) title.substring(0, idx) else title.ifBlank { "其他" }
    }

    /**
     * 按店铺分组统计
     */
    data class StoreStat(
        val name: String,
        val amount: Double,
        val count: Int,
        val usedCount: Int
    )

    fun groupByStore(coupons: List<Coupon>): List<StoreStat> {
        val map = mutableMapOf<String, StoreStat>()
        for (c in coupons) {
            val store = extractStore(c.title)
            val prev = map[store] ?: StoreStat(store, 0.0, 0, 0)
            map[store] = prev.copy(
                amount = prev.amount + (c.discountAmount ?: 0.0),
                count = prev.count + 1,
                usedCount = prev.usedCount + if (c.isUsed) 1 else 0
            )
        }
        return map.values.sortedByDescending { it.amount }
    }
}
