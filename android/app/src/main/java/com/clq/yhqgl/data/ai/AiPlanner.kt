package com.clq.yhqgl.data.ai

import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.DiscountType
import com.clq.yhqgl.rules.CouponRules
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * AI 解析结果落成的**可执行计划**。
 *
 * 放在 data 层而不是 UI 层，是因为现在有两个入口都要它：
 * 列表页的 [com.clq.yhqgl.ui.AIDialog]（弹窗式，一句话改一张券）
 * 和底部导航的 AI 页（对话式，连续查询 + 新增 + 识图）。两边如果各写一份，
 * 「按标题模糊找目标」这类规则迟早会漂。
 */
sealed interface AiPlan {
    val valid: Boolean

    data class Create(val coupon: Coupon) : AiPlan {
        override val valid = true
    }

    data class Update(val before: Coupon, val after: Coupon) : AiPlan {
        override val valid = true
    }

    data class Delete(val target: Coupon) : AiPlan {
        override val valid = true
    }

    /** query / chat 或找不到目标：只展示，不执行 */
    data class Unsupported(val reason: String) : AiPlan {
        override val valid = false
    }
}

object AiPlanner {

    private val ISO: DateTimeFormatter =
        DateTimeFormatter.ISO_OFFSET_DATE_TIME.withZone(ZoneOffset.ofHours(8))

    private fun nowIso(): String = ISO.format(Instant.now())

    /**
     * 把意图落成计划。
     *
     * update / delete 的目标可能给的是 id，也可能只给标题（模型经常这样），
     * 所以两种都试：精确 id → 精确标题 → 标题包含。匹配不到就明确告诉用户
     * 「没找到」，而不是静默失败。
     */
    fun build(intent: AiIntent, coupons: List<Coupon>): AiPlan {
        fun findTarget(): Coupon? {
            val raw = intent.targetId?.trim().orEmpty()
            if (raw.isEmpty()) return null
            coupons.firstOrNull { it.id == raw }?.let { return it }
            return coupons.firstOrNull { it.title == raw }
                ?: coupons.firstOrNull { it.title.contains(raw, ignoreCase = true) }
        }

        return when (intent.intent) {
            "create" -> AiPlan.Create(newCoupon(intent.changes))

            "update" -> {
                val target = findTarget()
                if (target == null) {
                    AiPlan.Unsupported("AI 想改一张券，但本地没找到目标（${intent.targetId ?: "未指定"}）")
                } else {
                    AiPlan.Update(before = target, after = applyChanges(target, intent.changes))
                }
            }

            "delete" -> {
                val target = findTarget()
                if (target == null) {
                    AiPlan.Unsupported("AI 想删一张券，但本地没找到目标（${intent.targetId ?: "未指定"}）")
                } else {
                    AiPlan.Delete(target)
                }
            }

            else -> AiPlan.Unsupported("这条只是问答，不需要执行操作")
        }
    }

    fun intentLabel(intent: String): String = when (intent) {
        "create" -> "新建优惠券"
        "update" -> "修改优惠券"
        "delete" -> "删除优惠券"
        "query" -> "查询"
        else -> "闲聊"
    }

    fun newCoupon(changes: Map<String, String?>): Coupon = Coupon(
        id = UUID.randomUUID().toString(),
        title = changes["title"] ?: "未命名",
        description = changes["description"],
        discountType = parseDiscountType(changes["discountType"]),
        discountAmount = changes["discountAmount"]?.toDoubleOrNull(),
        fullAmount = changes["fullAmount"]?.toDoubleOrNull(),
        startDate = changes["startDate"] ?: LocalDate.now().toString(),
        endDate = changes["endDate"] ?: LocalDate.now().plusDays(30).toString(),
        endHour = changes["endHour"]?.toIntOrNull() ?: 23,
        endMinute = changes["endMinute"]?.toIntOrNull() ?: 59,
        isUsed = changes["isUsed"]?.toBooleanStrictOrNull() ?: false,
        notes = changes["notes"],
        tags = parseTags(changes["tags"]),
        createdAt = nowIso()
    )

    /** 只覆盖 AI 明确给出的字段，没提的保持原值 —— 否则改个日期会把备注清空 */
    fun applyChanges(base: Coupon, changes: Map<String, String?>): Coupon = base.copy(
        title = changes["title"] ?: base.title,
        description = changes["description"] ?: base.description,
        discountType = parseDiscountType(changes["discountType"]) ?: base.discountType,
        discountAmount = changes["discountAmount"]?.toDoubleOrNull() ?: base.discountAmount,
        fullAmount = changes["fullAmount"]?.toDoubleOrNull() ?: base.fullAmount,
        startDate = changes["startDate"] ?: base.startDate,
        endDate = changes["endDate"] ?: base.endDate,
        endHour = changes["endHour"]?.toIntOrNull() ?: base.endHour,
        endMinute = changes["endMinute"]?.toIntOrNull() ?: base.endMinute,
        isUsed = changes["isUsed"]?.toBooleanStrictOrNull() ?: base.isUsed,
        notes = changes["notes"] ?: base.notes,
        // AI 明确给了 tags 才覆盖，没提就保留原标签
        tags = changes["tags"]?.let { parseTags(it) } ?: base.tags
    )

    /** 只列出真正变了的字段 */
    fun diffRows(before: Coupon, after: Coupon): List<Triple<String, String, String>> {
        val rows = mutableListOf<Triple<String, String, String>>()
        fun add(label: String, from: String, to: String) {
            if (from != to) rows += Triple(label, from, to)
        }
        add("标题", before.title, after.title)
        add("折扣", CouponRules.discountLabel(before), CouponRules.discountLabel(after))
        add("开始", before.startDate, after.startDate)
        add("到期", before.endDate, after.endDate)
        add(
            "截止",
            String.format("%02d:%02d", before.endHour ?: 23, before.endMinute ?: 59),
            String.format("%02d:%02d", after.endHour ?: 23, after.endMinute ?: 59)
        )
        add("已用", if (before.isUsed) "是" else "否", if (after.isUsed) "是" else "否")
        add("备注", before.notes ?: "—", after.notes ?: "—")
        return rows
    }

    /** 一句话概括计划，用于对话流里的气泡 */
    fun summary(plan: AiPlan): String = when (plan) {
        is AiPlan.Create ->
            "拟新建「${plan.coupon.title}」· ${CouponRules.discountLabel(plan.coupon)} · " +
                "${plan.coupon.endDate} 到期"
        is AiPlan.Update -> {
            val diffs = diffRows(plan.before, plan.after)
            if (diffs.isEmpty()) {
                "AI 没给出实际改动"
            } else {
                "拟修改「${plan.before.title}」：" +
                    diffs.joinToString("；") { (label, from, to) -> "$label $from → $to" }
            }
        }
        is AiPlan.Delete -> "拟删除「${plan.target.title}」（${plan.target.endDate} 到期）"
        is AiPlan.Unsupported -> plan.reason
    }

    private fun parseTags(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        return CouponRules.normalizeTags(raw.split(',', '，', '、', ' ', '/').map { it.trim() })
    }

    fun parseDiscountType(raw: String?): DiscountType? = when (raw?.lowercase()?.trim()) {
        "amount", "立减", "金额" -> DiscountType.AMOUNT
        "percentage", "折扣", "几折" -> DiscountType.PERCENTAGE
        "full", "满减" -> DiscountType.FULL
        "group", "团购" -> DiscountType.GROUP
        else -> null
    }
}
