package com.clq.yhqgl.data.sync

import kotlinx.serialization.json.Json
import okhttp3.Credentials
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 轻量 WebDAV 客户端（基于 OkHttp）
 */
 class WebDAVClient(
    private val baseUrl: String,
    private val username: String,
    private val password: String
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    private fun auth() = Credentials.basic(username, password)

    private fun url(path: String): String {
        val normalizedBase = baseUrl.trimEnd('/')
        val normalizedPath = path.trimStart('/')
        return "$normalizedBase/$normalizedPath"
    }

    /**
     * 检查路径是否存在（PROPFIND 简化）
     */
    suspend fun exists(path: String): Boolean {
        val request = Request.Builder()
            .url(url(path))
            .method("PROPFIND", "".toRequestBody("text/xml".toMediaType()))
            .header("Authorization", auth())
            .header("Depth", "0")
            .build()
        return try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (e: IOException) {
            false
        }
    }

    /**
     * 创建目录
     */
    suspend fun mkcol(path: String): Boolean {
        val request = Request.Builder()
            .url(url(path))
            .method("MKCOL", null)
            .header("Authorization", auth())
            .build()
        return client.newCall(request).execute().use {
            it.isSuccessful || it.code == 405 // 405 = already exists
        }
    }

    /**
     * 读取文本文件
     */
    suspend fun get(path: String): String? {
        val request = Request.Builder()
            .url(url(path))
            .get()
            .header("Authorization", auth())
            .build()
        return client.newCall(request).execute().use { response ->
            if (response.isSuccessful) response.body?.string() else null
        }
    }

    /**
     * 写入文本文件
     */
    suspend fun put(path: String, content: String): Boolean {
        val request = Request.Builder()
            .url(url(path))
            .put(content.toRequestBody("application/json; charset=utf-8".toMediaType()))
            .header("Authorization", auth())
            .build()
        return client.newCall(request).execute().use { it.isSuccessful }
    }

    /**
     * 获取 ETag（用于乐观锁）
     */
    suspend fun etag(path: String): String? {
        val request = Request.Builder()
            .url(url(path))
            .method("HEAD", null)
            .header("Authorization", auth())
            .build()
        return client.newCall(request).execute().use { response ->
            if (response.isSuccessful) response.header("ETag") else null
        }
    }
}
