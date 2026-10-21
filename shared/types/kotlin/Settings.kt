package com.clq.yhqgl.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
 data class WebDAVSettings(
    val url: String,
    val username: String,
    val password: String,
    @SerialName("rootPath")
    val rootPath: String = "/yhqgl/v2"
)

@Serializable
 data class SyncSettings(
    @SerialName("autoSync")
    val autoSync: Boolean = true,
    @SerialName("syncIntervalMinutes")
    val syncIntervalMinutes: Int = 15,
    @SerialName("syncOnWifiOnly")
    val syncOnWifiOnly: Boolean = false
)

@Serializable
 data class ReminderSettings(
    val enabled: Boolean = true,
    @SerialName("remindDays")
    val remindDays: List<Int> = listOf(7, 3, 1),
    @SerialName("quietStart")
    val quietStart: String? = null,
    @SerialName("quietEnd")
    val quietEnd: String? = null
)

@Serializable
 data class AISettings(
    val provider: String = "agnes",
    @SerialName("apiKey")
    val apiKey: String? = null,
    @SerialName("baseUrl")
    val baseUrl: String? = null,
    @SerialName("model")
    val model: String? = null
)

@Serializable
 data class AppSettings(
    @SerialName("schemaVersion")
    val schemaVersion: Int = 2,
    val webdav: WebDAVSettings? = null,
    val sync: SyncSettings = SyncSettings(),
    val reminder: ReminderSettings = ReminderSettings(),
    val ai: AISettings = AISettings(),
    /**
     * 用户维护的标签库（设置页里增删改的就是它）。
     * 空列表 = 还没动过，用 shared/data/tags.json 的默认名单。
     * 一旦编辑过就落成显式列表 —— 否则「删掉某个默认标签」下次又会被默认名单带回来。
     */
    @SerialName("tagLibrary")
    val tagLibrary: List<String> = emptyList()
)
