package com.clq.yhqgl.data.settings

import android.content.Context
import androidx.core.content.edit
import com.clq.yhqgl.data.cloud.SecurePrefs
import com.clq.yhqgl.model.AISettings
import com.clq.yhqgl.model.AiAssistant
import com.clq.yhqgl.model.AppSettings
import com.clq.yhqgl.model.ReminderSettings
import com.clq.yhqgl.model.SyncSettings
import com.clq.yhqgl.model.WebDAVSettings
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * 本地设置存储（加密，失败自动降级）。
 *
 * 与 [com.clq.yhqgl.data.cloud.CloudAuth] 共用同一套 [SecurePrefs] 兜底：
 * 它同样在 `ServiceLocator.init()` 阶段被创建，一旦 EncryptedSharedPreferences
 * 建不出来就是启动崩溃 —— 而这个文件只是存 WebDAV/AI 配置，不值得为它挡住用户。
 */
 class SettingsStore(context: Context) {
    private val prefs = SecurePrefs.open(context.applicationContext, "yhqgl_settings")

    private val json = Json { ignoreUnknownKeys = true }

    var settings: AppSettings
        get() = AppSettings(
            schemaVersion = 2,
            webdav = prefs.getString("webdav", null)?.let {
                json.decodeFromString(WebDAVSettings.serializer(), it)
            },
            sync = SyncSettings(
                autoSync = prefs.getBoolean("autoSync", true),
                syncIntervalMinutes = prefs.getInt("syncIntervalMinutes", 15),
                syncOnWifiOnly = prefs.getBoolean("syncOnWifiOnly", false)
            ),
            reminder = ReminderSettings(
                enabled = prefs.getBoolean("reminderEnabled", true),
                remindDays = prefs.getString("remindDays", null)?.let {
                    json.decodeFromString(ListSerializer(Int.serializer()), it)
                } ?: listOf(7, 3, 1),
                quietStart = prefs.getString("quietStart", null),
                quietEnd = prefs.getString("quietEnd", null)
            ),
            ai = AISettings(
                provider = prefs.getString("aiProvider", null) ?: "agnes",
                apiKey = prefs.getString("aiApiKey", null),
                baseUrl = prefs.getString("aiBaseUrl", null),
                model = prefs.getString("aiModel", null)
            ),
            tagLibrary = prefs.getString("tagLibrary", null)?.let {
                json.decodeFromString(ListSerializer(String.serializer()), it)
            } ?: emptyList(),
            aiAssistants = prefs.getString("aiAssistants", null)?.let {
                json.decodeFromString(ListSerializer(AiAssistant.serializer()), it)
            } ?: emptyList(),
            activeAssistantId = prefs.getString("activeAssistantId", null)
        )
        set(value) {
            prefs.edit {
                putString("webdav", value.webdav?.let { json.encodeToString(WebDAVSettings.serializer(), it) })
                putBoolean("autoSync", value.sync.autoSync)
                putInt("syncIntervalMinutes", value.sync.syncIntervalMinutes)
                putBoolean("syncOnWifiOnly", value.sync.syncOnWifiOnly)
                putBoolean("reminderEnabled", value.reminder.enabled)
                putString("remindDays", json.encodeToString(ListSerializer(Int.serializer()), value.reminder.remindDays))
                putString("quietStart", value.reminder.quietStart)
                putString("quietEnd", value.reminder.quietEnd)
                putString("aiProvider", value.ai.provider)
                putString("aiApiKey", value.ai.apiKey)
                putString("aiBaseUrl", value.ai.baseUrl)
                putString("aiModel", value.ai.model)
                putString(
                    "tagLibrary",
                    json.encodeToString(ListSerializer(String.serializer()), value.tagLibrary)
                )
                putString(
                    "aiAssistants",
                    json.encodeToString(ListSerializer(AiAssistant.serializer()), value.aiAssistants)
                )
                putString("activeAssistantId", value.activeAssistantId)
            }
        }

    var webdav: WebDAVSettings?
        get() = settings.webdav
        set(value) {
            settings = settings.copy(webdav = value)
        }

    fun updateAssistants(assistants: List<AiAssistant>, activeId: String?) {
        settings = settings.copy(aiAssistants = assistants, activeAssistantId = activeId)
    }

    fun updateTagLibrary(library: List<String>) {
        settings = settings.copy(tagLibrary = library)
    }
}
