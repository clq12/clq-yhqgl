package com.clq.yhqgl.data.ai

import com.clq.yhqgl.model.Coupon
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
    val baseUrl: String?
)

 @Serializable
data class AiIntent(
    val intent: String, // create / update / delete / query / chat
    val targetId: String?,
    val changes: Map<String, String?>,
    val filters: Map<String, String?>,
    val reasoning: String
)
