package com.clq.yhqgl.data.ai

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * 默认 Agnes Provider（OpenAI 兼容接口）
 */
 class AgnesProvider(
    private val apiKey: String,
    private val baseUrl: String = "https://api.agnes.ai/v1",
    private val model: String = "agnes-chat"
) : AIProvider {
    override val name = "agnes"

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun chat(messages: List<ChatMessage>): Result<String> {
        val body = ChatRequest(
            model = model,
            messages = messages.map { Message(it.role, it.content) },
            temperature = 0.0
        )
        val request = Request.Builder()
            .url("$baseUrl/chat/completions")
            .post(json.encodeToString(ChatRequest.serializer(), body).toRequestBody("application/json".toMediaType()))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .build()

        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return Result.failure(Exception("HTTP ${response.code}"))
                }
                val text = response.body?.string() ?: return Result.failure(Exception("Empty response"))
                val result = json.decodeFromString(ChatResponse.serializer(), text)
                Result.success(result.choices.firstOrNull()?.message?.content ?: "")
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun parseIntent(text: String, context: AIContext): Result<AiIntent> {
        val systemPrompt = buildString {
            appendLine("你是优惠券管理助手。请把用户的自然语言命令解析为结构化 JSON。")
            appendLine("字段：intent(create/update/delete/query/chat)、targetId、changes(Map<String,String?>)、filters(Map<String,String?>)、reasoning")
            appendLine("日期格式 YYYY-MM-DD，折扣类型只能是 amount/percentage/full/group 之一。")
            appendLine("当前共有 ${context.coupons.size} 张优惠券。")
            appendLine("只输出合法 JSON，不要多余解释。")
        }
        return chat(
            listOf(
                ChatMessage("system", systemPrompt),
                ChatMessage("user", text)
            )
        ).map { raw ->
            val cleaned = raw.trim()
                .removePrefix("```json")
                .removePrefix("```")
                .removeSuffix("```")
                .trim()
            json.decodeFromString(AiIntent.serializer(), cleaned)
        }
    }

    @Serializable
    private data class ChatRequest(
        val model: String,
        val messages: List<Message>,
        val temperature: Double
    )

    @Serializable
    private data class Message(val role: String, val content: String)

    @Serializable
    private data class ChatResponse(
        val choices: List<Choice>
    ) {
        @Serializable
        data class Choice(val message: Message)
    }
}
