package com.clq.yhqgl.data.ai

import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.DiscountType
import com.clq.yhqgl.rules.CouponRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * AI 查询与计划的回归测试。
 *
 * 为什么值得单独测：AI 页的答案必须是**确定的**。模型只负责把话翻成 [AiQuery]，
 * 真正的筛选在 [AiQueryEngine] 里算 —— 一旦这里的口径和列表页/今日待办跑偏，
 * 用户就会看到「AI 说 3 张、点进列表 5 张」，比答不上来更糟。
 */
class AiQueryEngineTest {

    private val today: LocalDate = LocalDate.parse(CouponRules.beijingDateOf())

    private fun coupon(
        title: String,
        endOffsetDays: Long,
        used: Boolean = false,
        discountAmount: Double? = null,
        tags: List<String> = emptyList(),
        notes: String? = null
    ) = Coupon(
        id = "id-$title-$endOffsetDays",
        title = title,
        discountType = discountAmount?.let { DiscountType.AMOUNT },
        discountAmount = discountAmount,
        startDate = today.minusDays(10).toString(),
        endDate = today.plusDays(endOffsetDays).toString(),
        endHour = 23,
        endMinute = 59,
        isUsed = used,
        notes = notes,
        tags = tags,
        createdAt = today.minusDays(10).toString()
    )

    @Test
    fun `今天到期只算未使用且未过期的`() {
        val list = listOf(
            coupon("今天到期的券", 0),
            coupon("今天到期但已用", 0, used = true),
            coupon("明天到期", 1)
        )
        val result = AiQueryEngine.run(AiQuery(preset = QueryPreset.TODAY), list)
        assertEquals(listOf("今天到期的券"), result.coupons.map { it.title })
    }

    @Test
    fun `近期到期按天数窗口过滤且排除已用`() {
        val list = listOf(
            coupon("今天", 0),
            coupon("两天后", 2),
            coupon("十天后", 10),
            coupon("两天后但已用", 2, used = true)
        )
        val result = AiQueryEngine.run(AiQuery(preset = QueryPreset.SOON, horizonDays = 3), list)
        assertEquals(listOf("今天", "两天后"), result.coupons.map { it.title })
    }

    @Test
    fun `已过期分组不包含已使用的券`() {
        val list = listOf(
            coupon("过期未用", -3),
            coupon("过期已用", -3, used = true),
            coupon("还没过期", 1)
        )
        val result = AiQueryEngine.run(AiQuery(preset = QueryPreset.EXPIRED), list)
        assertEquals(listOf("过期未用"), result.coupons.map { it.title })
    }

    @Test
    fun `关键词会命中标题备注和标签`() {
        val list = listOf(
            coupon("瑞幸咖啡券", 2),
            coupon("星巴克券", 2, notes = "瑞幸隔壁买的"),
            coupon("美团券", 2, tags = listOf("瑞幸")),
            coupon("无关券", 2)
        )
        val result = AiQueryEngine.run(
            AiQuery(preset = QueryPreset.SOON, horizonDays = 7, keyword = "瑞幸"),
            list
        )
        assertEquals(3, result.coupons.size)
    }

    @Test
    fun `标签与最低金额可叠加`() {
        val list = listOf(
            coupon("抖音大额", 2, discountAmount = 20.0, tags = listOf("抖音")),
            coupon("抖音小额", 2, discountAmount = 3.0, tags = listOf("抖音")),
            coupon("淘宝大额", 2, discountAmount = 20.0, tags = listOf("淘宝"))
        )
        val result = AiQueryEngine.run(
            AiQuery(preset = QueryPreset.SOON, horizonDays = 7, tag = "抖音", minAmount = 10.0),
            list
        )
        assertEquals(listOf("抖音大额"), result.coupons.map { it.title })
    }

    @Test
    fun `结果按截止时刻升序`() {
        val list = listOf(
            coupon("五天后", 5),
            coupon("今天", 0),
            coupon("三天后", 3)
        )
        val result = AiQueryEngine.run(AiQuery(preset = QueryPreset.SOON, horizonDays = 7), list)
        assertEquals(listOf("今天", "三天后", "五天后"), result.coupons.map { it.title })
    }

    @Test
    fun `模型给的自然语言筛选条件能被归一`() {
        assertEquals(QueryPreset.WEEK, AiQueryEngine.fromFilters(mapOf("range" to "这周")).preset)
        assertEquals(QueryPreset.EXPIRED, AiQueryEngine.fromFilters(mapOf("status" to "过期")).preset)
        assertEquals(QueryPreset.USED, AiQueryEngine.fromFilters(mapOf("status" to "已使用")).preset)
        assertEquals(QueryPreset.UNUSED, AiQueryEngine.fromFilters(mapOf("status" to "未使用")).preset)

        // 「10天内」这种写法要从自由文本里抠出天数
        val tenDays = AiQueryEngine.fromFilters(mapOf("range" to "10天内到期"))
        assertEquals(QueryPreset.SOON, tenDays.preset)
        assertEquals(10, tenDays.horizonDays)

        // 什么都没给时给一个有用的默认值（近期 7 天），而不是报错
        assertEquals(QueryPreset.SOON, AiQueryEngine.fromFilters(emptyMap()).preset)
        assertEquals(7, AiQueryEngine.fromFilters(emptyMap()).horizonDays)
    }

    @Test
    fun `计划能按标题模糊找到目标券`() {
        val target = coupon("瑞幸咖啡 5 折券", 5)
        val list = listOf(target, coupon("星巴克券", 3))

        val update = AiPlanner.build(
            AiIntent(
                intent = "update",
                targetId = "瑞幸",
                changes = mapOf("endDate" to today.plusDays(20).toString())
            ),
            list
        )
        assertTrue(update is AiPlan.Update)
        update as AiPlan.Update
        assertEquals(target.id, update.before.id)
        assertEquals(today.plusDays(20).toString(), update.after.endDate)
        // 没提到的字段保持原值
        assertEquals(target.title, update.after.title)
    }

    @Test
    fun `找不到目标时明确说明而不是静默失败`() {
        val plan = AiPlanner.build(
            AiIntent(intent = "delete", targetId = "不存在的券"),
            listOf(coupon("瑞幸券", 3))
        )
        assertTrue(plan is AiPlan.Unsupported)
        assertFalse(plan.valid)
    }

    @Test
    fun `新建计划会带上标签与折扣类型`() {
        val plan = AiPlanner.build(
            AiIntent(
                intent = "create",
                changes = mapOf(
                    "title" to "星巴克 5 折",
                    "discountType" to "percentage",
                    "discountAmount" to "50",
                    "endDate" to today.plusDays(7).toString(),
                    "tags" to "咖啡, 星巴克"
                )
            ),
            emptyList()
        )
        assertTrue(plan is AiPlan.Create)
        plan as AiPlan.Create
        assertEquals(DiscountType.PERCENTAGE, plan.coupon.discountType)
        assertEquals(listOf("咖啡", "星巴克"), plan.coupon.tags)
        assertEquals(today.plusDays(7).toString(), plan.coupon.endDate)
    }
}
