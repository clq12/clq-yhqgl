package com.clq.yhqgl.data.cloud

import android.content.Context
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlin.random.Random

/**
 * 云账号认证（邮箱验证码）。
 *
 * 完整链路与网页端一致，三步：
 * 1. POST /v1/verification            {email, usage}          -> {verification_id, is_user}
 * 2. POST /v1/verification/verify     {verification_id, verification_code} -> {verification_token}
 * 3. POST /v1/signin                  {username, verification_token}       -> 会话
 *    （新账号走 /v1/signup，需要额外带 email + password）
 *
 * 会话存在 EncryptedSharedPreferences 里；access_token 过期用 refresh_token 续。
 */
class CloudAuth(context: Context) {

    private val appContext = context.applicationContext

    private val masterKey = MasterKey.Builder(appContext)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        appContext,
        "yhqgl_cloud_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    // ---------------------------------------------------------------- 会话读写

    fun currentSession(): CloudSession? {
        val token = prefs.getString(KEY_ACCESS, null) ?: return null
        val userId = prefs.getString(KEY_USER_ID, null) ?: return null
        return CloudSession(
            accessToken = token,
            refreshToken = prefs.getString(KEY_REFRESH, null),
            expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L),
            userId = userId,
            email = prefs.getString(KEY_EMAIL, null),
            name = prefs.getString(KEY_NAME, null)
        )
    }

    fun isSignedIn(): Boolean = currentSession() != null

    /** 上次登录过的账号 id，用来判断本地数据是否属于当前账号（同账号才认领） */
    var lastOwnerId: String?
        get() = prefs.getString(KEY_LAST_OWNER, null)
        set(value) = prefs.edit { putString(KEY_LAST_OWNER, value) }

    private fun saveSession(session: CloudSession) {
        prefs.edit {
            putString(KEY_ACCESS, session.accessToken)
            putString(KEY_REFRESH, session.refreshToken)
            putLong(KEY_EXPIRES_AT, session.expiresAt)
            putString(KEY_USER_ID, session.userId)
            putString(KEY_EMAIL, session.email)
            putString(KEY_NAME, session.name)
            putString(KEY_LAST_OWNER, session.userId)
        }
    }

    fun signOut() {
        // 只清本机会话，不动 lastOwnerId —— 下次同一账号登录仍能认领本地数据
        prefs.edit {
            remove(KEY_ACCESS)
            remove(KEY_REFRESH)
            remove(KEY_EXPIRES_AT)
            remove(KEY_USER_ID)
            remove(KEY_EMAIL)
            remove(KEY_NAME)
        }
    }

    /**
     * 取一个可用的 access token；过期就用 refresh_token 续一次。
     * 续不上返回 null，调用方应提示重新登录。
     */
    suspend fun ensureToken(): String? {
        val session = currentSession() ?: return null
        if (!session.isExpired()) return session.accessToken
        val refreshed = refresh(session.refreshToken) ?: return null
        saveSession(refreshed)
        return refreshed.accessToken
    }

    // ---------------------------------------------------------------- 登录三步

    /** 第一步：发验证码 */
    suspend fun sendCode(email: String): Result<OtpChallenge> = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("email", email.trim())
            put("usage", "email")
        }
        val (code, payload) = postJson(CloudConfig.PATH_VERIFICATION, body)
        val obj = payload?.jsonObjectOrNull()
        if (code !in 200..299 || obj == null) {
            return@withContext Result.failure(CloudException(readError(code, payload, "验证码发送失败")))
        }
        val id = obj["verification_id"]?.jsonPrimitive?.contentOrNull
            ?: return@withContext Result.failure(CloudException("服务端没有返回 verification_id"))
        val isUser = obj["is_user"]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() ?: true
        Result.success(OtpChallenge(id, isUser))
    }

    /** 第二步 + 第三步：验码换一次性 token，再换会话 */
    suspend fun verifyCode(
        email: String,
        challenge: OtpChallenge,
        code: String
    ): Result<CloudSession> = withContext(Dispatchers.IO) {
        val verifyBody = buildJsonObject {
            put("verification_id", challenge.verificationId)
            put("verification_code", code.trim())
        }
        val (vCode, vPayload) = postJson(CloudConfig.PATH_VERIFICATION_VERIFY, verifyBody)
        val vObj = vPayload?.jsonObjectOrNull()
        if (vCode !in 200..299 || vObj == null) {
            return@withContext Result.failure(CloudException(readError(vCode, vPayload, "验证码校验失败")))
        }
        val verificationToken = vObj["verification_token"]?.jsonPrimitive?.contentOrNull
            ?: return@withContext Result.failure(CloudException("服务端没有返回 verification_token"))

        val sessionPath: String
        val sessionBody: JsonObject
        if (challenge.isUser) {
            sessionPath = CloudConfig.PATH_SIGNIN
            sessionBody = buildJsonObject {
                put("username", email.trim())
                put("verification_token", verificationToken)
            }
        } else {
            // 首次在这套服务上注册：上游注册要求密码，用户平时只用验证码，
            // 这里生成一个随机密码存进本机，万一以后要密码登录也拿得到。
            val password = randomPassword()
            prefs.edit { putString(KEY_SIGNUP_PASSWORD, password) }
            sessionPath = CloudConfig.PATH_SIGNUP
            sessionBody = buildJsonObject {
                put("email", email.trim())
                put("password", password)
                put("verification_token", verificationToken)
            }
        }

        val (sCode, sPayload) = postJson(sessionPath, sessionBody)
        val session = parseSession(sPayload, email)
            ?: return@withContext Result.failure(CloudException(readError(sCode, sPayload, "登录失败")))
        saveSession(session)
        Result.success(session)
    }

    private suspend fun refresh(refreshToken: String?): CloudSession? = withContext(Dispatchers.IO) {
        if (refreshToken.isNullOrBlank()) return@withContext null
        val body = buildJsonObject {
            put("grant_type", "refresh_token")
            put("refresh_token", refreshToken)
        }
        val (code, payload) = postJson(CloudConfig.PATH_TOKEN, body)
        if (code !in 200..299) return@withContext null
        parseSession(payload, currentSession()?.email)
    }

    private fun parseSession(payload: JsonElement?, email: String?): CloudSession? {
        val obj = payload?.jsonObjectOrNull() ?: return null
        val access = obj["access_token"]?.jsonPrimitive?.contentOrNull
        if (access.isNullOrBlank()) return null
        val expiresIn = obj["expires_in"]?.jsonPrimitive?.longOrNull ?: 0L
        return CloudSession(
            accessToken = access,
            refreshToken = obj["refresh_token"]?.jsonPrimitive?.contentOrNull,
            expiresAt = if (expiresIn > 0) System.currentTimeMillis() + expiresIn * 1000 else 0L,
            userId = obj["sub"]?.jsonPrimitive?.contentOrNull ?: "",
            email = email ?: obj["email"]?.jsonPrimitive?.contentOrNull,
            name = obj["name"]?.jsonPrimitive?.contentOrNull
        )
    }

    // ---------------------------------------------------------------- HTTP 基元

    private fun postJson(url: String, body: JsonObject, token: String? = null): Pair<Int, JsonElement?> {
        val builder = Request.Builder()
            .url(url)
            .header(CloudConfig.ACCESS_KEY_HEADER, CloudConfig.PUBLISHABLE_KEY)
            .post(json.encodeToString(JsonObject.serializer(), body).toRequestBody(jsonMedia))
        if (token != null) builder.header("Authorization", "Bearer $token")
        return try {
            http.newCall(builder.build()).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                resp.code to (if (text.isBlank()) null else runCatching { json.parseToJsonElement(text) }.getOrNull())
            }
        } catch (e: IOException) {
            -1 to null
        }
    }

    private fun readError(code: Int, payload: JsonElement?, fallback: String): String {
        val obj = payload?.jsonObjectOrNull()
        if (obj != null) {
            val msg = obj["error_description"]?.jsonPrimitive?.contentOrNull
                ?: obj["message"]?.jsonPrimitive?.contentOrNull
                ?: obj["error"]?.jsonPrimitive?.contentOrNull
            if (!msg.isNullOrBlank()) return msg
        }
        return when {
            code == -1 -> "网络不可用，请检查连接"
            code == 401 || code == 403 -> "身份已失效，请重新登录"
            code >= 500 -> "服务端暂时不可用（$code）"
            else -> fallback
        }
    }

    private fun randomPassword(): String {
        val bytes = ByteArray(24).also { Random.nextBytes(it) }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private companion object {
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_EXPIRES_AT = "expires_at"
        const val KEY_USER_ID = "user_id"
        const val KEY_EMAIL = "email"
        const val KEY_NAME = "name"
        const val KEY_LAST_OWNER = "last_owner_id"
        const val KEY_SIGNUP_PASSWORD = "signup_password"
    }
}

class CloudException(message: String) : Exception(message)

internal fun JsonElement.jsonObjectOrNull(): JsonObject? =
    runCatching { jsonObject }.getOrNull()
