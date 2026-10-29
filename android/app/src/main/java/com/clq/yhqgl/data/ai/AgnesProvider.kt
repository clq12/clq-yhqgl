package com.clq.yhqgl.data.ai

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** 提示词里最多塞多少张券：够模型认标题，又不至于把上下文撑爆 */
private const val MAX_CONTEXT_COUPONS = 40

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
            appendLine("你是「优惠券管理」App 的助手。把用户的话解析成一个 JSON 对象，不要输出多余解释。")
            appendLine("字段：")
            appendLine("- intent：create / update / delete / query / chat")
            appendLine("- targetId：字符串或 null。update/delete 优先填券的 id；不知道 id 就填券标题原文")
            appendLine("- changes：对象。create/update 用，可用键 title、description、discountType、discountAmount、fullAmount、startDate、endDate、endHour、endMinute、notes、tags、isUsed")
            appendLine("- filters：对象。query 用，可用键 preset（today/soon/week/month/expired/used/unused/all）、days、keyword、tag、minAmount")
            appendLine("- reasoning：一句话说明你的理解")
            appendLine("规则：")
            appendLine("- 日期一律 YYYY-MM-DD，今天是 ${context.today}（北京时间）。「这周」按 7 天内算。")
            appendLine("- discountType 只能是 amount（立减金额）/ percentage（几折）/ full（满减）/ group（团购）。")
            appendLine("- update 只填要改的键；没提到的键不要出现（写了空值会把原值清掉）。")
            appendLine("- 用户只是问「有没有 / 哪些 / 多少 / 什么时候到期」时用 query，不要 create。")
            appendLine("- 图片里没有、用户也没说的信息不要编造。")
            appendLine("当前共 ${context.coupons.size} 张券，格式「标题 | 到期日 | 标签」：")
            context.coupons.take(MAX_CONTEXT_COUPONS).forEach { c ->
                appendLine("- ${c.title} | ${c.endDate} | ${c.tags.joinToString("/")}")
            }
            if (context.coupons.size > MAX_CONTEXT_COUPONS) {
                appendLine("- …（还有 ${context.coupons.size - MAX_CONTEXT_COUPONS} 张未列出）")
            }
        }
        return chat(
            listOf(
                ChatMessage("system", systemPrompt),
                ChatMessage("user", text)
            )
        ).map { raw ->
            json.decodeFromString(AiIntent.serializer(), cleanJson(raw))
        }
    }

    /** 模型经常把 JSON 包在 ```json 里，或前后加一句客套话，这里剥干净 */
    private fun cleanJson(raw: String): String {
        val trimmed = raw.trim()
        val fenced = Regex("```(?:json)?\\s*([\\s\\S]*?)```").find(trimmed)?.groupValues?.get(1)
        val body = (fenced ?: trimmed).trim()
        val start = body.indexOf('{')
        val end = body.lastIndexOf('}')
        return if (start in 0 until end) body.substring(start, end + 1) else body
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
    /**
     * 识图：把优惠券截图（data URL）交给多模态模型，抽成与文字指令一致的 [AiIntent]。
     *
     * 走 OpenAI 兼容的 content 数组格式（text + image_url），base64 内联，不依赖图床。
     * 模型不支持图片时接口一般返回 4xx，这里把状态码和响应片段如实抛出去，
     * 让用户知道该去设置里换个多模态模型，而不是干等。
     */
    suspend fun recognizeImage(imageDataUrl: String): Result<AiIntent> = withContext(Dispatchers.IO) {
        val systemPrompt = "你是优惠券识别助手。请读取图片里的优惠券信息并输出结构化 JSON。\n" +
            "字段：intent 固定为 create、targetId 为 null、changes 为对象、filters 为空对象、reasoning 为简短说明。\n" +
            "changes 可用键：title、description、discountType、discountAmount、fullAmount、startDate、endDate、endHour、endMinute、notes、tags。\n" +
            "discountType 只能是 amount/percentage/full/group；日期 YYYY-MM-DD；tags 用逗号分隔。\n" +
            "图片里没有的信息不要编造，直接省略该键。只输出合法 JSON。"

        val body = buildJsonObject {
            put("model", model)
            put("temperature", 0)
            putJsonArray("messages") {
                addJsonObject {
                    put("role", "system")
                    put("content", systemPrompt)
                }
                addJsonObject {
                    put("role", "user")
                    putJsonArray("content") {
                        addJsonObject {
                            put("type", "text")
                            put("text", "识别这张图里的优惠券")
                        }
                        addJsonObject {
                            put("type", "image_url")
                            putJsonObject("image_url") { put("url", imageDataUrl) }
                        }
                    }
                }
            }
        }

        val request = Request.Builder()
            .url("$baseUrl/chat/completions")
            .post(json.encodeToString(JsonObject.serializer(), body).toRequestBody("application/json".toMediaType()))
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    return@withContext Result.failure(
                        IllegalStateException("识图失败（${response.code}）：请确认该助手选的是支持图片的模型。${text.take(120)}")
                    )
                }
                val content = runCatching {
                    json.parseToJsonElement(text).jsonObject["choices"]!!.jsonArray[0]
                        .jsonObject["message"]!!.jsonObject["content"]!!.jsonPrimitive.contentOrNull
                }.getOrNull().orEmpty()

                val cleaned = cleanJson(content)
                runCatching { json.decodeFromString(AiIntent.serializer(), cleaned) }
                    .fold(
                        onSuccess = { Result.success(it) },
                        onFailure = {
                            Result.failure(
                                IllegalStateException("模型返回的不是合法 JSON：${content.take(120)}")
                            )
                        }
                    )
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
