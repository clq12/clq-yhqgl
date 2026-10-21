package com.clq.yhqgl.data.ai

import com.clq.yhqgl.model.AiAssistant
import com.clq.yhqgl.model.AppSettings

/**
 * 多个 AI 助手的选择逻辑（与网页端 `web/src/ai/assistants.ts` 同语义）。
 *
 * 老配置里只有一个 `ai`（provider/key/baseUrl/model），没有 `aiAssistants`。
 * 为了升级后不让用户"key 突然不见了"，这里把它当成唯一助手兜底出来；
 * 一旦用户在设置里加过助手，就以列表为准。
 */
object AiAssistants {

    fun effective(settings: AppSettings): List<AiAssistant> {
        val list = settings.aiAssistants
        if (list.isNotEmpty()) return list

        val legacy = settings.ai
        val key = legacy.apiKey
        if (key.isNullOrBlank()) return emptyList()

        return listOf(
            AiAssistant(
                id = LEGACY_ID,
                name = if (legacy.provider == "agnes") "默认助手" else legacy.provider.ifBlank { "AI 助手" },
                provider = legacy.provider.ifBlank { "agnes" },
                baseUrl = legacy.baseUrl,
                model = legacy.model,
                apiKey = key,
                // 老配置看不出模型是否支持图片，先允许尝试：不支持时接口会报错，提示比禁用按钮有用
                vision = true
            )
        )
    }

    /** 当前选中的助手；没指定就取第一个 */
    fun active(settings: AppSettings): AiAssistant? {
        val list = effective(settings)
        if (list.isEmpty()) return null
        val id = settings.activeAssistantId
        return list.firstOrNull { it.id == id } ?: list.first()
    }

    /** 能识图的助手 */
    fun vision(settings: AppSettings): List<AiAssistant> =
        effective(settings).filter { it.vision }

    const val LEGACY_ID = "legacy-default"
}
