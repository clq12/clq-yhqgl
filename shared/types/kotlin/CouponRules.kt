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
    fun remainingHours(coupon: Coupon, nowUtc: Long = System.currentTimeMillis()): Long {
        val deadline = deadlineTimestamp(coupon)
        // 必须用 floorDiv：Kotlin 的 `/` 对负数向零截断，而网页端 Math.floor 向负无穷取整，
        // 已过期的券两端会算出不同的天数（-1 天 vs 0 天）。
        return Math.floorDiv(deadline - nowUtc, 3_600_000L)
    }

    /**
     * 剩余天数
     */
    fun remainingDays(coupon: Coupon, nowUtc: Long = System.currentTimeMillis()): Long =
        Math.floorDiv(remainingHours(coupon, nowUtc), 24L)

    /**
     * 是否已过期
     */
    fun isExpired(coupon: Coupon, nowUtc: Long = System.currentTimeMillis()): Boolean =
        remainingHours(coupon, nowUtc) < 0

    /**
     * 是否有效（未使用且未过期）
     */
    fun isActive(coupon: Coupon, nowUtc: Long = System.currentTimeMillis()): Boolean =
        !coupon.isUsed && !isExpired(coupon, nowUtc)

    /**
     * 是否需要在指定天数内提醒
     */
    fun shouldRemindWithinDays(
        coupon: Coupon,
        days: Int,
        nowUtc: Long = System.currentTimeMillis()
    ): Boolean {
        if (coupon.isUsed) return false
        val hours = remainingHours(coupon, nowUtc)
        return hours >= 0 && hours < days * 24
    }

    /**
     * 获取当前应提醒的天数（返回 0 表示无需提醒）
     */
    fun currentRemindDays(
        coupon: Coupon,
        remindDays: List<Int>,
        nowUtc: Long = System.currentTimeMillis()
    ): Int {
        for (days in remindDays.sortedDescending()) {
            if (shouldRemindWithinDays(coupon, days, nowUtc) && !coupon.remindedDays.contains(days)) {
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
     * 优惠力度的展示文案。
     *
     * 两端必须一模一样，所以放在共享规则里 —— 安卓和网页各自算会导致
     * 同一张券在手机和电脑上显示成两种说法。
     */
    fun discountLabel(coupon: Coupon): String = when (coupon.discountType) {
        DiscountType.AMOUNT -> "减 ¥${formatAmount(coupon.discountAmount ?: 0.0)}"
        DiscountType.PERCENTAGE -> "${formatAmount(coupon.discountAmount ?: 0.0)} 折"
        DiscountType.FULL -> "满 ¥${formatAmount(coupon.fullAmount ?: 0.0)} 减 ¥${formatAmount(coupon.discountAmount ?: 0.0)}"
        DiscountType.GROUP -> "团购券"
        null -> "无门槛"
    }

    /** 金额展示：整数不带小数点，其余最多两位 */
    fun formatAmount(value: Double): String {
        val rounded = Math.round(value * 100.0) / 100.0
        return if (rounded % 1.0 == 0.0) rounded.toLong().toString() else rounded.toString()
    }

    /**
     * 状态标签（与网页端 CouponList 的 statusOf 一致）
     */
    data class StatusLabel(val text: String, val tone: String)

    fun statusLabel(coupon: Coupon, nowUtc: Long = System.currentTimeMillis()): StatusLabel {
        if (coupon.isUsed) return StatusLabel("已使用", "neutral")
        if (isExpired(coupon, nowUtc)) return StatusLabel("已过期", "danger")
        val days = remainingDays(coupon, nowUtc)
        return if (days <= 3) StatusLabel("仅剩 $days 天", "warning")
        else StatusLabel("剩余 $days 天", "success")
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
        // 首段为空（标题以空格开头）时不能直接返回原串：网页端那边是 title.trim() || '其他'，
        // 这里必须同样先 trim，否则同一个标题两端会得到「  小王小店…」和「小王小店…」两种店铺名。
        return if (idx > 0) title.substring(0, idx) else title.trim().ifBlank { "其他" }
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
    // ---------------------------------------------------------------- 标签

    /** 标签最大长度（UTF-16 单元），双端一致 */
    const val TAG_MAX_LENGTH = 12

    /**
     * 常用标签（与 shared/data/tags.json 一致，contract-check 会校验不得漂移）。
     * 顺序即推荐顺序：新用户没有历史标签时按这个顺序补位。
     */
    val defaultTags = listOf(
        "抖音", "拼多多", "淘宝", "天猫", "京东", "美团", "饿了么", "支付宝", "微信支付",
        "云闪付", "星巴克", "瑞幸", "肯德基", "麦当劳", "蜜雪冰城", "盒马", "山姆",
        "屈臣氏", "加油", "电影票", "话费"
    )

    // 必须显式列出 Unicode 空白：Java/Kotlin 的 \s 只有 [ \t\n\x0B\f\r]，
    // 而 JS 的 \s 还包含 NBSP(U+00A0)、全角空格(U+3000)、U+2000~U+200A 等。
    // 从网页复制来的标签常常带 NBSP，不补齐的话两端归一化结果会不一样。
    private val TAG_BLANK = Regex("[\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+")

    /**
     * 归一化单个标签：
     * - 连续的空白（含全角空格）压成一个空格，首尾去空白
     * - 去掉开头 # / ＃
     * - 超长截断到 [TAG_MAX_LENGTH]
     * - 空串返回 null
     */
    fun normalizeTag(raw: String?): String? {
        if (raw == null) return null
        var s = TAG_BLANK.replace(raw, " ").trim()
        while (s.startsWith("#") || s.startsWith("＃")) {
            s = s.substring(1).trim()
        }
        if (s.isEmpty()) return null
        return if (s.length > TAG_MAX_LENGTH) s.substring(0, TAG_MAX_LENGTH) else s
    }

    /** 归一化一组标签：丢空、去重、保持首次出现的顺序 */
    fun normalizeTags(list: List<String?>?): List<String> {
        if (list == null) return emptyList()
        val out = mutableListOf<String>()
        for (raw in list) {
            val t = normalizeTag(raw) ?: continue
            if (!out.contains(t)) out.add(t)
        }
        return out
    }

    /**
     * 推荐标签：先按历史使用频次（高的在前，同频按字符序，保证两端结果一致），
     * 不够 limit 个再用常用标签补位。
     */
    fun suggestTags(
        coupons: List<Coupon>,
        exclude: List<String> = emptyList(),
        limit: Int = 8,
        /** 兜底名单：默认用常用标签，设置页里改过标签库就传进来 */
        fallback: List<String> = defaultTags
    ): List<String> {
        val counts = mutableMapOf<String, Int>()
        for (c in coupons) {
            for (raw in c.tags) {
                val t = normalizeTag(raw) ?: continue
                counts[t] = (counts[t] ?: 0) + 1
            }
        }

        val excluded = normalizeTags(exclude).toSet()
        val ranked = counts.entries
            .filter { !excluded.contains(it.key) }
            // 频次降序；同频按字符串比较，不能用 locale 相关比较器，否则两端顺序会不一样
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
            .map { it.key }
            .toMutableList()

        for (t in fallback) {
            if (ranked.size >= limit) break
            if (!excluded.contains(t) && !ranked.contains(t)) ranked.add(t)
        }
        return ranked.take(limit)
    }

    /**
     * 实际生效的标签库：设置里没配置过（空）就用默认名单。
     *
     * 默认名单是常量，用户删掉其中一个之后如果仍然"空 = 用默认"，
     * 下次打开又全回来了。所以设置页任何一次编辑都会落成显式列表。
     */
    fun tagLibraryOf(library: List<String>?): List<String> {
        val normalized = normalizeTags(library)
        return if (normalized.isNotEmpty()) normalized else defaultTags
    }

    /** 从文本里识别标签（录入时按标题自动点选） */
    fun detectTags(text: String, candidates: List<String> = defaultTags): List<String> {
        if (text.isEmpty()) return emptyList()
        val out = mutableListOf<String>()
        for (c in candidates) {
            if (text.contains(c) && !out.contains(c)) out.add(c)
        }
        return out
    }
    // ---------------------------------------------------------------- 今日待办

    /**
     * 北京时间的「今天」日期串（YYYY-MM-DD）。
     *
     * 不能用系统默认时区：券的截止时刻是按北京时间写的，
     * 「今天到期」必须和截止判定用同一个时区，否则会提前或滞后一天。
     */
    fun beijingDateOf(nowUtc: Long = System.currentTimeMillis()): String =
        java.time.Instant.ofEpochMilli(nowUtc).atOffset(BEIJING_OFFSET).toLocalDate().toString()

    /** 首页「今日待办」分组 */
    data class DueBuckets(
        val today: List<Coupon>,
        val soon: List<Coupon>,
        val highValue: List<Coupon>,
        val expired: List<Coupon>
    )

    /**
     * 分组规则：已使用的一律不进任何组；组内按截止时刻升序，
     * 高价值组按金额降序（同额按 id 升序，保证两端顺序一致）。
     */
    fun dueBuckets(
        coupons: List<Coupon>,
        nowUtc: Long = System.currentTimeMillis(),
        highValueLimit: Int = 3
    ): DueBuckets {
        val today = beijingDateOf(nowUtc)

        val byDeadline = Comparator<Coupon> { a, b ->
            val diff = deadlineTimestamp(a) - deadlineTimestamp(b)
            if (diff != 0L) diff.toInt() else a.id.compareTo(b.id)
        }
        val byAmount = Comparator<Coupon> { a, b ->
            val diff = (b.discountAmount ?: 0.0) - (a.discountAmount ?: 0.0)
            if (diff != 0.0) {
                // 只关心正负，避免大数值转 Int 溢出
                if (diff > 0) 1 else -1
            } else {
                a.id.compareTo(b.id)
            }
        }

        val todayList = mutableListOf<Coupon>()
        val soonList = mutableListOf<Coupon>()
        val expiredList = mutableListOf<Coupon>()
        val valuable = mutableListOf<Coupon>()

        for (c in coupons) {
            if (c.isUsed) continue
            if (isExpired(c, nowUtc)) {
                expiredList.add(c)
                continue
            }
            if (c.endDate == today) {
                todayList.add(c)
            } else if (c.endDate > today && remainingDays(c, nowUtc) <= 3) {
                soonList.add(c)
            }
            if ((c.discountAmount ?: 0.0) > 0) valuable.add(c)
        }

        return DueBuckets(
            today = todayList.sortedWith(byDeadline),
            soon = soonList.sortedWith(byDeadline),
            highValue = valuable.sortedWith(byAmount).take(highValueLimit),
            expired = expiredList.sortedWith(byDeadline)
        )
    }
}
