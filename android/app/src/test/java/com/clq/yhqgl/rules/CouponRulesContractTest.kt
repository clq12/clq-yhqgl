package com.clq.yhqgl.rules

import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.DiscountType
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import java.io.File
import org.junit.Test

/**
 * 双端规则契约测试。
 *
 * 用例与期望值都来自仓库根目录的 shared/data/，由 scripts/contract-check.mjs
 * 用 TypeScript 实现同一套规则算出来。这里用 Kotlin 实现重算一遍，
 * 任何一边改了规则而另一边没跟上，CI 就会红。
 *
 * 单测的工作目录是 android/app，所以仓库根在上两级。
 */
class CouponRulesContractTest {

    private val dataDir = File("../../shared/data")
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `规则实现与 TypeScript 端结论一致`() {
        val casesFile = File(dataDir, "contract-cases.json")
        val expectedFile = File(dataDir, "contract-expected.json")
        assertTrue("找不到契约用例：${casesFile.absolutePath}", casesFile.exists())
        assertTrue("找不到期望值：${expectedFile.absolutePath}", expectedFile.exists())

        val casesRoot = json.parseToJsonElement(casesFile.readText()).jsonObject
        val expectedRoot = json.parseToJsonElement(expectedFile.readText()).jsonObject
        val nowUtc = expectedRoot["nowMs"]?.jsonPrimitive?.longOrNull
            ?: error("contract-expected.json 缺少 nowMs")

        val expectedCases = expectedRoot["cases"]!!.jsonArray.map { it.jsonObject }
        val actualCases = casesRoot["cases"]!!.jsonArray.map { it.jsonObject }

        assertEquals("用例数量与期望值数量不一致", expectedCases.size, actualCases.size)

        for (index in actualCases.indices) {
            val caseObj = actualCases[index]
            val expected = expectedCases[index]
            val name = caseObj["name"]?.jsonPrimitive?.contentOrNull ?: "case-$index"
            val coupon = toCoupon(caseObj["coupon"]!!.jsonObject)

            assertEquals(
                "[$name] deadlineTimestamp",
                expected["deadlineMs"]!!.jsonPrimitive.longOrNull,
                CouponRules.deadlineTimestamp(coupon)
            )
            assertEquals(
                "[$name] remainingDays",
                expected["remainingDays"]!!.jsonPrimitive.longOrNull,
                CouponRules.remainingDays(coupon, nowUtc)
            )
            assertEquals(
                "[$name] isExpired",
                expected["expired"]!!.jsonPrimitive.booleanOrNull,
                CouponRules.isExpired(coupon, nowUtc)
            )
            assertEquals(
                "[$name] isActive",
                expected["active"]!!.jsonPrimitive.booleanOrNull,
                CouponRules.isActive(coupon, nowUtc)
            )
            val status = CouponRules.statusLabel(coupon, nowUtc)
            assertEquals(
                "[$name] statusText",
                expected["statusText"]!!.jsonPrimitive.contentOrNull,
                status.text
            )
            assertEquals(
                "[$name] statusTone",
                expected["statusTone"]!!.jsonPrimitive.contentOrNull,
                status.tone
            )
            assertEquals(
                "[$name] discountLabel",
                expected["discountLabel"]!!.jsonPrimitive.contentOrNull,
                CouponRules.discountLabel(coupon)
            )
            assertEquals(
                "[$name] extractStore",
                expected["store"]!!.jsonPrimitive.contentOrNull,
                CouponRules.extractStore(coupon.title)
            )
        }

        // ---- 标签归一化：逐条比对，null 也要能对上
        val expectedTagCases = expectedRoot["tagCases"]?.jsonArray?.map { it.jsonObject } ?: emptyList()
        val actualTagCases = casesRoot["tagCases"]?.jsonArray?.map { it.jsonObject } ?: emptyList()
        assertEquals("标签用例数量与期望值数量不一致", expectedTagCases.size, actualTagCases.size)
        for (index in actualTagCases.indices) {
            val raw = actualTagCases[index]["raw"]?.jsonPrimitive?.contentOrNull
            val expectedValue = expectedTagCases[index]["normalized"]
                ?.jsonPrimitive
                ?.contentOrNull
                ?.takeIf { it != "null" }
            assertEquals(
                "[标签 #${index + 1}] normalizeTag($raw)",
                expectedValue,
                CouponRules.normalizeTag(raw)
            )
        }

        // ---- 标签推荐：频次降序 → 同频字符序 → 常用标签补位
        val suggestCase = casesRoot["suggestCase"]?.jsonObject
        val suggestExpected = expectedRoot["suggestCase"]?.jsonObject
        if (suggestCase != null && suggestExpected != null) {
            val existing = suggestCase["existing"]!!.jsonArray.map { row ->
                row.jsonArray.mapNotNull { it.jsonPrimitive.contentOrNull }
            }
            val exclude = suggestCase["exclude"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                ?: emptyList()
            val limit = suggestCase["limit"]?.jsonPrimitive?.intOrNull ?: 8
            val expectedTags = suggestExpected["expected"]!!.jsonArray.mapNotNull {
                it.jsonPrimitive.contentOrNull
            }

            // 只用到 tags 字段，其余字段给空值即可
            val coupons = existing.mapIndexed { i, tags ->
                Coupon(
                    id = "tag-case-$i",
                    title = "",
                    startDate = "2026-01-01",
                    endDate = "2026-12-31",
                    createdAt = "2026-01-01T00:00:00+08:00",
                    tags = tags
                )
            }
            assertEquals(
                "[标签推荐] suggestTags",
                expectedTags,
                CouponRules.suggestTags(coupons, exclude, limit)
            )
        }
    }

    private fun toCoupon(obj: JsonObject): Coupon {
        fun str(key: String): String? = obj[key]?.jsonPrimitive?.contentOrNull?.takeIf { it != "null" }
        fun num(key: String): Double? = obj[key]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()
        fun int(key: String): Int? = obj[key]?.jsonPrimitive?.intOrNull

        return Coupon(
            id = str("id") ?: "",
            title = str("title") ?: "",
            description = str("description"),
            discountType = when (str("discountType")) {
                "amount" -> DiscountType.AMOUNT
                "percentage" -> DiscountType.PERCENTAGE
                "full" -> DiscountType.FULL
                "group" -> DiscountType.GROUP
                else -> null
            },
            discountAmount = num("discountAmount"),
            fullAmount = num("fullAmount"),
            startDate = str("startDate") ?: "",
            endDate = str("endDate") ?: "",
            endHour = int("endHour"),
            endMinute = int("endMinute"),
            isReminded = obj["isReminded"]?.jsonPrimitive?.booleanOrNull ?: false,
            remindedDays = obj["remindedDays"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull }
                ?: emptyList(),
            isUsed = obj["isUsed"]?.jsonPrimitive?.booleanOrNull ?: false,
            notes = str("notes"),
            createdAt = str("createdAt") ?: "",
            updatedAt = str("updatedAt"),
            version = null,
            modifiedAt = str("modifiedAt"),
            deletedAt = null
        )
    }
}
