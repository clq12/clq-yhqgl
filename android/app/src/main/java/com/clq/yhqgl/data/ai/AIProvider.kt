package com.clq.yhqgl.data.ai

import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.rules.CouponRules
import kotlinx.serialization.Serializable

/**
 * AI Provider 抽象接口
 */
 interface AIProvider {
    val name: String

    /**
     * 通用聊天请求
     */
    suspend fun chat(messages: List<ChatMessage>): Result<String>

    /**
     * 解析自然语言命令为结构化意图
     */
    suspend fun parseIntent(text: String, context: AIContext): Result<AiIntent>
}

 data class ChatMessage(
    val role: String, // system / user / assistant
    val content: String
)

 data class AIContext(
    val coupons: List<Coupon>,
    val defaultProvider: String,
    val apiKey: String?,
    val baseUrl: String?,
    /**
     * 「今天」的北京日期（YYYY-MM-DD）。
     *
     * 塞进提示词是为了让模型能把「下周五」「这个月底」这类相对说法换算成绝对日期；
     * 用北京时间而不是设备时区，与到期判定保持同一套口径。
     */
    val today: String = CouponRules.beijingDateOf()
)

 /**
 * 模型返回的结构化意图。
 *
 * 除 [intent] 外一律给默认值：模型漏字段是常态，缺一个 `filters` 就整个解析失败、
 * 弹一句「模型返回的不是合法 JSON」，对用户毫无意义。
 */
@Serializable
data class AiIntent(
    val intent: String, // create / update / delete / query / chat
    val targetId: String? = null,
    val changes: Map<String, String?> = emptyMap(),
    val filters: Map<String, String?> = emptyMap(),
    val reasoning: String = ""
)
