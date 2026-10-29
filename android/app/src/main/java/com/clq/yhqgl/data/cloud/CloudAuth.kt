package com.clq.yhqgl.data.cloud

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
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
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit

/**
 * 云账号认证。
 *
 * 支持两条并存的登录链，最终都落到同一个 `sub`（也就是 RLS 里的 `auth.uid()`）：
 *
 * **A. 邮箱验证码**（原有）
 * 1. `POST /v1/verification`      `{email, usage:"email"}`            -> `{verification_id, is_user?}`
 * 2. `POST /v1/verification/verify` `{verification_id, verification_code}` -> `{verification_token}`
 * 3. `POST /v1/signin`            `{username, verification_token}`    -> 会话（老用户）
 *    或 `POST /v1/signup`          `{email, password, verification_token}` -> 会话（新用户）
 *
 * **B. 账号密码**（本次新增）
 * - 登录：`POST /v1/signin`  `{username, password}`
 * - 注册：先走 A 的第 1、2 步拿 `verification_token`，再 `POST /v1/signup {email, password, verification_token}`
 *   —— 上游**拒绝**只有用户名+密码的注册，所以「密码注册」也必须验一次邮箱。
 * - 改密（知道旧密码）：`POST /v1/user/sudo {password}` -> `{sudo_token}`，
 *   再 `PATCH /v1/user/password {sudo_token, new_password}`
 * - 改密（不知道旧密码，验证码注册的老账号）：再走一次发码（`usage:"PASSWORD_RESET"`）
 *   -> 验码换 token -> `POST /v1/reset {email, new_password, verification_token}` -> 用新密码登录
 *
 * 会话存在本地偏好里（见 [SecurePrefs]，加密不可用时自动降级，不再让 App 起不来）；
 * access_token 过期用 refresh_token 续。
 */
class CloudAuth(context: Context) {

    private val appContext = context.applicationContext

    // 走 SecurePrefs：EncryptedSharedPreferences 在「从备份恢复 / Keystore 失效」时会抛异常，
    // 老代码直接在 ServiceLocator.init() 里创建，等于启动即崩溃 —— 那正是「手机端登录不了」的一大来源。
    private val prefs = SecurePrefs.open(appContext, PREF_NAME)

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
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

    /**
     * 当前账号是否还在用初始默认密码（`123456`）。
     *
     * 只存一个布尔标记，**不存密码本身** —— 早期版本会把自动生成的随机密码写进本地，
     * 那等于在设备上留一份可直接登录的凭据，没有必要。
     */
    var usesDefaultPassword: Boolean
        get() = prefs.getBoolean(KEY_DEFAULT_PWD, false)
        set(value) = prefs.edit { putBoolean(KEY_DEFAULT_PWD, value) }

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

    // ---------------------------------------------------------------- 验证码链

    /** 第一步：发验证码 */
    suspend fun sendCode(email: String): Result<OtpChallenge> = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("email", email.trim())
            put("usage", "email")
        }
        val (code, payload) = request("POST", CloudConfig.PATH_VERIFICATION, body)
        val obj = payload?.jsonObjectOrNull()
        if (code !in 200..299 || obj == null) {
            return@withContext Result.failure(
                CloudException(readError(code, payload, "验证码发送失败"), code)
            )
        }
        val id = obj["verification_id"]?.jsonPrimitive?.contentOrNull
            ?: return@withContext Result.failure(CloudException("服务端没有返回 verification_id", code))

        // ⚠️ 这里曾经写反过，是「手机端登录不了」的直接原因：
        // 上游 /v1/verification 对新邮箱**根本不返回 is_user**（实测只回 verification_id/expires_in），
        // 老代码用 `?: true` 兜底，于是新账号被当成老账号去 /v1/signin，必然失败。
        // 官方 SDK 的判定是 `is_user === true`，缺省即「新用户」。
        val isUserFlag = obj.booleanAt("is_user")
        val isUserKnown = obj.containsKey("is_user")
        Result.success(
            OtpChallenge(
                verificationId = id,
                isUser = isUserFlag == true,
                isUserKnown = isUserKnown
            )
        )
    }

    /** 第二步 + 第三步：验码换一次性 token，再换会话 */
    suspend fun verifyCode(
        email: String,
        challenge: OtpChallenge,
        code: String,
        password: String? = null
    ): Result<CloudSession> = withContext(Dispatchers.IO) {
        val verifyBody = buildJsonObject {
            put("verification_id", challenge.verificationId)
            put("verification_code", code.trim())
        }
        val (vCode, vPayload) = request("POST", CloudConfig.PATH_VERIFICATION_VERIFY, verifyBody)
        val vObj = vPayload?.jsonObjectOrNull()
        if (vCode !in 200..299 || vObj == null) {
            return@withContext Result.failure(
                CloudException(readError(vCode, vPayload, "验证码校验失败"), vCode)
            )
        }
        val verificationToken = vObj["verification_token"]?.jsonPrimitive?.contentOrNull
            ?: return@withContext Result.failure(
                CloudException("服务端没有返回 verification_token", vCode)
            )

        val pwd = password?.takeIf { it.isNotBlank() } ?: DEFAULT_PASSWORD

        val first = if (challenge.isUser) {
            signInWithToken(email, verificationToken)
        } else {
            signUpWithToken(email, pwd, verificationToken)
        }
        first.onSuccess {
            saveSession(it)
            usesDefaultPassword = !challenge.isUser && pwd == DEFAULT_PASSWORD
            return@withContext Result.success(it)
        }

        // 上游明确给过 is_user 就认它的判断，不再瞎猜
        if (challenge.isUserKnown) return@withContext first

        // is_user 缺失时才留一条退路：只有 4xx（业务拒绝）才换另一条链重试，
        // 网络/5xx 重试没有意义，只会把「网络不行」伪装成「账号有问题」。
        val err = first.exceptionOrNull() as? CloudException ?: return@withContext first
        if (err.httpCode !in 400..499) return@withContext first

        val second = if (challenge.isUser) {
            signUpWithToken(email, pwd, verificationToken)
        } else {
            signInWithToken(email, verificationToken)
        }
        second.onSuccess {
            saveSession(it)
            usesDefaultPassword = pwd == DEFAULT_PASSWORD
        }
    }

    private fun signInWithToken(email: String, verificationToken: String): Result<CloudSession> {
        val body = buildJsonObject {
            put("username", email.trim())
            put("verification_token", verificationToken)
        }
        return postForSession(CloudConfig.PATH_SIGNIN, body, email)
    }

    private fun signUpWithToken(
        email: String,
        password: String,
        verificationToken: String
    ): Result<CloudSession> {
        val body = buildJsonObject {
            put("email", email.trim())
            put("password", password)
            put("verification_token", verificationToken)
        }
        return postForSession(CloudConfig.PATH_SIGNUP, body, email)
    }

    // ---------------------------------------------------------------- 密码链

    /** 账号密码登录 */
    suspend fun signInWithPassword(email: String, password: String): Result<CloudSession> =
        withContext(Dispatchers.IO) {
            val target = email.trim()
            if (target.isBlank()) return@withContext Result.failure(CloudException("请填写邮箱"))
            if (password.isBlank()) return@withContext Result.failure(CloudException("请填写密码"))

            val body = buildJsonObject {
                put("username", target)
                put("password", password)
            }
            val result = postForSession(CloudConfig.PATH_SIGNIN, body, target)
            result.onSuccess {
                saveSession(it)
                // 密码登录成功，说明用户自己知道密码；只有恰好是默认密码时才提示改密
                usesDefaultPassword = password == DEFAULT_PASSWORD
            }
        }

    /**
     * 账号密码注册。
     *
     * 上游要求「先验码再注册」，所以这里的 [verificationToken] 必须来自
     * `sendCode` + `verifyCode` 的前两步（与验证码注册共用同一条链）。
     */
    suspend fun signUpWithPassword(
        email: String,
        password: String,
        verificationToken: String
    ): Result<CloudSession> = withContext(Dispatchers.IO) {
        val target = email.trim()
        if (target.isBlank()) return@withContext Result.failure(CloudException("请填写邮箱"))
        validateNewPassword(password)?.let { return@withContext Result.failure(CloudException(it)) }

        val body = buildJsonObject {
            put("email", target)
            put("password", password)
            put("verification_token", verificationToken)
        }
        postForSession(CloudConfig.PATH_SIGNUP, body, target).onSuccess {
            saveSession(it)
            usesDefaultPassword = password == DEFAULT_PASSWORD
        }
    }

    /** 单独发一次注册用验证码（密码注册的第一步） */
    suspend fun sendSignUpCode(email: String): Result<OtpChallenge> = sendCode(email)

    // ---------------------------------------------------------------- 改密

    /**
     * 知道旧密码时直接改。
     *
     * 两步是上游的 sudo 机制：先拿一次性 `sudo_token`，再拿它换密码更新权限。
     * 验证码注册的账号如果没有改过密码，旧密码就是 [DEFAULT_PASSWORD]。
     */
    suspend fun changePasswordWithOld(
        oldPassword: String,
        newPassword: String
    ): Result<CloudSession> = withContext(Dispatchers.IO) {
        validateNewPassword(newPassword)?.let { return@withContext Result.failure(CloudException(it)) }
        if (oldPassword == newPassword) {
            return@withContext Result.failure(CloudException("新密码不能和旧密码相同"))
        }
        val token = ensureToken()
            ?: return@withContext Result.failure(CloudException("未登录或登录已过期，请重新登录"))

        val sudoBody = buildJsonObject { put("password", oldPassword) }
        val (sCode, sPayload) = request("POST", CloudConfig.PATH_USER_SUDO, sudoBody, token)
        val sudoToken = sPayload?.jsonObjectOrNull()?.get("sudo_token")?.jsonPrimitive?.contentOrNull
        if (sCode !in 200..299 || sudoToken.isNullOrBlank()) {
            val msg = when (sCode) {
                400, 401, 403 -> "旧密码不正确"
                else -> readError(sCode, sPayload, "旧密码校验失败")
            }
            return@withContext Result.failure(CloudException(msg, sCode))
        }

        val patchBody = buildJsonObject {
            put("sudo_token", sudoToken)
            put("new_password", newPassword)
        }
        val (pCode, pPayload) = request("PATCH", CloudConfig.PATH_USER_PASSWORD, patchBody, token)
        if (pCode !in 200..299) {
            return@withContext Result.failure(
                CloudException(readError(pCode, pPayload, "密码更新失败"), pCode)
            )
        }

        // 有的实现会顺手换发一次会话，有的不回包体；两种都要能用
        val renewed = parseSession(pPayload, currentSession()?.email) ?: currentSession()
        if (renewed == null) {
            return@withContext Result.failure(CloudException("密码已更新，但会话已失效，请重新登录", pCode))
        }
        saveSession(renewed)
        usesDefaultPassword = false
        Result.success(renewed)
    }

    /** 不知道旧密码时：发一封重置验证码（`usage` 必须是 `PASSWORD_RESET`） */
    suspend fun sendPasswordResetCode(email: String): Result<String> = withContext(Dispatchers.IO) {
        val target = email.trim()
        if (target.isBlank()) return@withContext Result.failure(CloudException("请填写邮箱"))
        val body = buildJsonObject {
            put("email", target)
            put("usage", "PASSWORD_RESET")
            put("target", "USER")
        }
        val (code, payload) = request("POST", CloudConfig.PATH_VERIFICATION, body)
        val id = payload?.jsonObjectOrNull()?.get("verification_id")?.jsonPrimitive?.contentOrNull
        if (code !in 200..299 || id.isNullOrBlank()) {
            return@withContext Result.failure(
                CloudException(readError(code, payload, "重置验证码发送失败"), code)
            )
        }
        Result.success(id)
    }

    /** 不知道旧密码时：验码 + 重置密码，成功后顺手登录 */
    suspend fun resetPasswordWithCode(
        email: String,
        verificationId: String,
        code: String,
        newPassword: String
    ): Result<CloudSession> = withContext(Dispatchers.IO) {
        validateNewPassword(newPassword)?.let { return@withContext Result.failure(CloudException(it)) }

        val verifyBody = buildJsonObject {
            put("verification_id", verificationId)
            put("verification_code", code.trim())
        }
        val (vCode, vPayload) = request("POST", CloudConfig.PATH_VERIFICATION_VERIFY, verifyBody)
        val verificationToken = vPayload?.jsonObjectOrNull()
            ?.get("verification_token")?.jsonPrimitive?.contentOrNull
        if (vCode !in 200..299 || verificationToken.isNullOrBlank()) {
            return@withContext Result.failure(
                CloudException(readError(vCode, vPayload, "验证码校验失败"), vCode)
            )
        }

        val resetBody = buildJsonObject {
            put("email", email.trim())
            put("new_password", newPassword)
            put("verification_token", verificationToken)
        }
        val (rCode, rPayload) = request("POST", CloudConfig.PATH_RESET, resetBody)
        if (rCode !in 200..299) {
            return@withContext Result.failure(
                CloudException(readError(rCode, rPayload, "密码重置失败"), rCode)
            )
        }

        // 重置接口不一定回会话，直接用新密码登录一次，行为最可控
        signInWithPassword(email, newPassword)
    }

    // ---------------------------------------------------------------- 内部

    private suspend fun refresh(refreshToken: String?): CloudSession? = withContext(Dispatchers.IO) {
        if (refreshToken.isNullOrBlank()) return@withContext null
        val body = buildJsonObject {
            put("grant_type", "refresh_token")
            put("refresh_token", refreshToken)
        }
        val (code, payload) = request("POST", CloudConfig.PATH_TOKEN, body)
        if (code !in 200..299) return@withContext null
        parseSession(payload, currentSession()?.email)
    }

    private fun postForSession(
        path: String,
        body: JsonObject,
        email: String?
    ): Result<CloudSession> {
        val (code, payload) = request("POST", path, body)
        val session = parseSession(payload, email)
            ?: return Result.failure(
                CloudException(readError(code, payload, "登录失败"), code)
            )
        return Result.success(session)
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

    private fun request(
        method: String,
        url: String,
        body: JsonObject? = null,
        token: String? = null
    ): Pair<Int, JsonElement?> {
        val builder = Request.Builder()
            .url(url)
            .header(CloudConfig.ACCESS_KEY_HEADER, CloudConfig.PUBLISHABLE_KEY)
            .header("Accept", "application/json")
        if (token != null) builder.header("Authorization", "Bearer $token")
        val payload = body?.let {
            json.encodeToString(JsonObject.serializer(), it).toRequestBody(jsonMedia)
        }
        when (method) {
            "GET" -> builder.get()
            "POST" -> builder.post(payload ?: "".toRequestBody(jsonMedia))
            "PATCH" -> builder.patch(payload ?: "".toRequestBody(jsonMedia))
            else -> error("unsupported method $method")
        }
        return try {
            http.newCall(builder.build()).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                resp.code to (if (text.isBlank()) null else runCatching { json.parseToJsonElement(text) }.getOrNull())
            }
        } catch (e: SocketTimeoutException) {
            NETWORK_TIMEOUT to null
        } catch (e: IOException) {
            NETWORK_UNAVAILABLE to null
        }
    }

    /**
     * 把服务端错误翻译成用户能懂、能据此行动的一句话。
     *
     * 老实现把所有非 5xx 都归成「验证码发送失败」，用户既不知道是密码错、验证码过期
     * 还是根本没网 —— 这也是「手机端登录不了」迟迟查不出原因的一部分。
     */
    private fun readError(code: Int, payload: JsonElement?, fallback: String): String {
        val obj = payload?.jsonObjectOrNull()
        val raw = obj?.let {
            it["error_description"]?.jsonPrimitive?.contentOrNull
                ?: it["message"]?.jsonPrimitive?.contentOrNull
                ?: it["error"]?.jsonPrimitive?.contentOrNull
                ?: it["msg"]?.jsonPrimitive?.contentOrNull
        }
        val friendly = raw?.let { friendlyMessage(it) }
        if (!friendly.isNullOrBlank()) {
            return if (code in 400..499) friendly else "$friendly（HTTP $code）"
        }
        return when {
            code == NETWORK_UNAVAILABLE -> "网络不可用：请确认手机能上网（校园网/公司网络若需认证，先联网）"
            code == NETWORK_TIMEOUT -> "连接超时：网络不太稳定，请重试一次"
            code == 400 -> "请求被服务端拒绝（HTTP 400）"
            code == 401 -> "账号或密码不正确（HTTP 401）"
            code == 403 -> "没有权限或账号已停用（HTTP 403）"
            code == 404 -> "接口不存在（HTTP 404），请升级 App"
            code == 409 -> "这个邮箱已经注册过了，直接登录即可"
            code == 422 -> "填写的内容不合法（HTTP 422）"
            code == 429 -> "操作太频繁，请稍后再试"
            code >= 500 -> "服务端暂时不可用（HTTP $code），请稍后重试"
            else -> "$fallback（HTTP $code）"
        }
    }

    /** 上游错误是英文，常见的几句翻一下，剩下的原样带出去 */
    private fun friendlyMessage(raw: String): String {
        val text = raw.trim()
        if (text.isBlank()) return text
        val lower = text.lowercase()
        return when {
            lower.contains("user already registered") || lower.contains("already exists") ->
                "这个邮箱已经注册过了，直接登录即可"
            lower.contains("invalid login credentials") || lower.contains("invalid credentials") ->
                "邮箱或密码不正确"
            lower.contains("user not found") || lower.contains("no user") ->
                "这个邮箱还没注册过"
            lower.contains("verification code") && (lower.contains("expir") || lower.contains("invalid")) ->
                "验证码错误或已过期，请重新获取"
            lower.contains("token has expired") || lower.contains("jwt expired") ->
                "登录状态已过期，请重新登录"
            lower.contains("password should be") || lower.contains("password is too") ->
                "密码长度不符合要求（至少 6 位）"
            lower.contains("rate limit") || lower.contains("too many requests") ->
                "操作太频繁，请稍后再试"
            lower.contains("email not confirmed") ->
                "邮箱还没验证，请用验证码登录一次"
            else -> text
        }
    }

    private fun validateNewPassword(password: String): String? = when {
        password.isBlank() -> "请填写新密码"
        password.length < MIN_PASSWORD_LENGTH -> "密码至少 $MIN_PASSWORD_LENGTH 位"
        password.length > 64 -> "密码太长了（最多 64 位）"
        password.isBlank() -> "密码不能全是空格"
        else -> null
    }

    /**
     * Kotlin 只允许一个 companion object，所以私有键名与对外常量放一起：
     * 键名用 private 修饰，类外依然看不到。
     */
    companion object {
        /**
         * 验证码注册的账号**初始默认密码**。
         *
         * 之所以要有它：验证码登录的账号在上游其实也有一条密码记录，但不给用户密码的话，
         * 他永远没法用「账号密码登录」（换设备、网页端都指望它）。
         * 统一给一个默认值，并在设置里提示「你还在用初始密码，建议改掉」。
         */
        const val DEFAULT_PASSWORD = "123456"

        /** 新密码最小长度 */
        const val MIN_PASSWORD_LENGTH = 6

        private const val PREF_NAME = "yhqgl_cloud_session"

        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_NAME = "name"
        private const val KEY_LAST_OWNER = "last_owner_id"
        private const val KEY_DEFAULT_PWD = "uses_default_password"

        /** 与真实 HTTP 码区分开的两个伪状态码，用于把网络问题与业务问题分开 */
        private const val NETWORK_UNAVAILABLE = -1
        private const val NETWORK_TIMEOUT = -2
    }
}

/** `httpCode` 为 0 表示本地校验失败，-1/-2 表示网络问题 */
class CloudException(message: String, val httpCode: Int = 0) : Exception(message)

internal fun JsonElement.jsonObjectOrNull(): JsonObject? =
    runCatching { jsonObject }.getOrNull()

internal fun JsonObject.booleanAt(key: String): Boolean? {
    val prim = this[key] as? JsonPrimitive ?: return null
    return prim.booleanOrNull ?: prim.contentOrNull?.toBooleanStrictOrNull()
}
