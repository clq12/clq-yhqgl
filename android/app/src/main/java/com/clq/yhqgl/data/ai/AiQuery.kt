package com.clq.yhqgl.data.ai

import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.rules.CouponRules

/**
 * 结构化查询条件。
 *
 * 为什么不让模型直接「读一遍券然后回答」：
 * 1. **会编**。券是用户的真实资产，到期日被幻觉编错一天，用户就白跑一趟；
 * 2. **贵**。每次都把几十条券塞进上下文，token 开销随数据量线性涨；
 * 3. **不可复现**。同一句话两次问，答案可能不一样。
 *
 * 所以分工是：模型只负责把自然语言翻成 [AiQuery]（意图 + 筛选条件），
 * 真正的筛选与统计在本地用 [CouponRules] 算 —— 与「今日待办」分组同一套规则，
 * 两端结论天然一致。模型答不上来时也不会影响正确性。
 */
data class AiQuery(
    val preset: QueryPreset = QueryPreset.SOON,
    val horizonDays: Int = 7,
    val keyword: String? = null,
    val tag: String? = null,
    val minAmount: Double? = null
)

enum class QueryPreset(val label: String) {
    TODAY("今天到期"),
    SOON("近期到期"),
    WEEK("7 天内到期"),
    MONTH("30 天内到期"),
    EXPIRED("已过期未使用"),
    USED("已使用"),
    UNUSED("未使用且在有效期"),
    ALL("全部")
}

/** 一次查询的结果：一句话结论 + 逐条明细 */
data class AiQueryResult(
    val headline: String,
    val coupons: List<Coupon>,
    val emptyHint: String
)

object AiQueryEngine {

    /**
     * 把模型给的 `filters` 归一成查询条件。
     *
     * 模型的输出不稳定：可能给 `{"preset":"week"}`，也可能给
     * `{"range":"这周","status":"unused"}`，甚至把中文写进 key。
     * 这里做「宽松解析 + 合理默认」，解析不出来就按「近期到期」处理 ——
     * 给用户一个有用的答案，好过弹一句「我没听懂」。
     */
    fun fromFilters(filters: Map<String, String?>?): AiQuery {
        val flat = filters.orEmpty()
            .mapKeys { it.key.trim().lowercase() }
            .mapValues { it.value?.trim()?.lowercase().orEmpty() }

        val joined = flat.values.joinToString(" ") + " " + flat.keys.joinToString(" ")
        val days = flat["days"]?.toIntOrNull()
            ?: flat["horizondays"]?.toIntOrNull()
            ?: flat["within"]?.toIntOrNull()
            ?: Regex("(\\d{1,3})\\s*天").find(joined)?.groupValues?.get(1)?.toIntOrNull()

        val preset = when {
            joined.containsAny("expired", "过期", "失效") -> QueryPreset.EXPIRED
            // 「已使用 / 已用 / 用过」都要认：中文里「已用」不是「已使用」的子串
            joined.containsAny("used", "已使用", "已用", "用过", "用掉了") -> QueryPreset.USED
            joined.containsAny("today", "今天", "今日", "当天") -> QueryPreset.TODAY
            joined.containsAny("month", "30", "一个月", "本月") -> QueryPreset.MONTH
            joined.containsAny("week", "7", "一周", "这周", "本周") -> QueryPreset.WEEK
            joined.containsAny("unused", "未使用", "没用过", "没用", "未用", "可用", "有效") ->
                QueryPreset.UNUSED
            joined.containsAny("all", "全部", "所有", "一共", "总共") -> QueryPreset.ALL
            joined.containsAny("soon", "近期", "快到期", "即将", "最近") -> QueryPreset.SOON
            else -> QueryPreset.SOON
        }

        val keyword = flat["keyword"]?.takeIf { it.isNotBlank() }
            ?: flat["title"]?.takeIf { it.isNotBlank() }
            ?: flat["store"]?.takeIf { it.isNotBlank() }

        val tag = flat["tag"]?.takeIf { it.isNotBlank() && it != "null" && it != "any" }
        val minAmount = flat["minamount"]?.toDoubleOrNull()
            ?: flat["amount"]?.toDoubleOrNull()

        val horizon = when {
            days != null && days > 0 -> days.coerceIn(1, 365)
            preset == QueryPreset.WEEK -> 7
            preset == QueryPreset.MONTH -> 30
            preset == QueryPreset.TODAY -> 0
            else -> 7
        }

        return AiQuery(
            preset = preset,
            horizonDays = horizon,
            keyword = keyword,
            tag = tag,
            minAmount = minAmount
        )
    }

    fun run(
        query: AiQuery,
        coupons: List<Coupon>,
        nowUtc: Long = System.currentTimeMillis()
    ): AiQueryResult {
        val today = CouponRules.beijingDateOf(nowUtc)

        val byPreset = coupons.filter { c ->
            if (c.isDeleted) return@filter false
            val expired = CouponRules.isExpired(c, nowUtc)
            val daysLeft = CouponRules.remainingDays(c, nowUtc)
            when (query.preset) {
                QueryPreset.TODAY -> !c.isUsed && !expired && c.endDate == today
                QueryPreset.SOON, QueryPreset.WEEK, QueryPreset.MONTH ->
                    !c.isUsed && !expired && daysLeft in 0..query.horizonDays.toLong()
                QueryPreset.EXPIRED -> !c.isUsed && expired
                QueryPreset.USED -> c.isUsed
                QueryPreset.UNUSED -> !c.isUsed && !expired
                QueryPreset.ALL -> true
            }
        }

        val filtered = byPreset.filter { c ->
            val keywordOk = query.keyword?.let { kw ->
                c.title.contains(kw, ignoreCase = true) ||
                    c.description?.contains(kw, ignoreCase = true) == true ||
                    c.notes?.contains(kw, ignoreCase = true) == true ||
                    c.tags.any { it.contains(kw, ignoreCase = true) }
            } ?: true

            val tagOk = query.tag?.let { raw ->
                val target = CouponRules.normalizeTag(raw)
                target != null && c.tags.any { it == target }
            } ?: true

            val amountOk = query.minAmount?.let { (c.discountAmount ?: 0.0) >= it } ?: true

            keywordOk && tagOk && amountOk
        }.sortedBy { CouponRules.deadlineTimestamp(it) }

        val scope = buildString {
            append(query.preset.label)
            query.keyword?.let { append(" · 含「$it」") }
            query.tag?.let { append(" · 标签「$it」") }
            query.minAmount?.let { append(" · 金额 ≥ $it") }
        }

        val headline = if (filtered.isEmpty()) {
            "$scope · 一共 0 张"
        } else {
            "$scope · 一共 ${filtered.size} 张"
        }

        val emptyHint = when (query.preset) {
            QueryPreset.TODAY -> "今天没有到期的券，可以放心。"
            QueryPreset.EXPIRED -> "没有过期未使用的券，挺整洁。"
            QueryPreset.USED -> "还没有标记为已使用的券。"
            else -> "这个范围内没有匹配的券。"
        }

        return AiQueryResult(headline = headline, coupons = filtered, emptyHint = emptyHint)
    }

    /** 明细行文案：「10-30 到期 · 还剩 1 天」 */
    fun describe(coupon: Coupon, nowUtc: Long = System.currentTimeMillis()): String {
        val days = CouponRules.remainingDays(coupon, nowUtc)
        val remain = when {
            days < 0 -> "已过期 ${-days} 天"
            days == 0L -> "今天到期"
            else -> "还剩 $days 天"
        }
        // 年份用北京时间判断，不跟着设备时区跑（与到期判定保持同一时区）
        val yearPrefix = CouponRules.beijingDateOf(nowUtc).take(5)
        val date = coupon.endDate.removePrefix(yearPrefix)
        return "$date 到期 · $remain"
    }

    private fun String.containsAny(vararg keys: String): Boolean =
        keys.any { this.contains(it) }
}
