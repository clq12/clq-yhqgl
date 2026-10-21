package com.clq.yhqgl.data.cloud

import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.DiscountType
import com.clq.yhqgl.model.VersionVectorEntry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 云数据库的 coupons 表读写（PostgREST 语义）。
 *
 * 设计取舍：
 * - 列表一律拉全量再本地过滤（数据量是"一个人的优惠券"，没必要折腾服务端过滤），
 *   而且同步逻辑本来就需要看见 deleted_at 非空的墓碑记录。
 * - 不做乐观锁判断，那是 [com.clq.yhqgl.data.sync.CloudSyncEngine] 的职责；
 *   这里只负责把"写入被接受 / 被拒绝"如实反馈。
 */
class CouponCloudApi(
    private val auth: CloudAuth,
    private val http: OkHttpClient = defaultClient()
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    // ------------------------------------------------------------------ 读

    /** 拉取当前账号的全部记录，**包含**已软删除的（同步需要墓碑） */
    suspend fun listAll(): Result<List<Coupon>> = withContext(Dispatchers.IO) {
        val token = auth.ensureToken()
            ?: return@withContext Result.failure(CloudException("未登录或登录已过期"))
        val url = "${CloudConfig.REST_BASE}/${CloudConfig.TABLE_COUPONS}?select=*&order=end_date.asc"
        val (code, payload) = request("GET", url, token)
        if (code !in 200..299) {
            return@withContext Result.failure(CloudException(errorText(code, payload, "拉取云端数据失败")))
        }
        val array = payload?.let { runCatching { it.jsonArray }.getOrNull() }
            ?: return@withContext Result.success(emptyList())
        val coupons = array.mapNotNull { rowToCoupon(it.jsonObject) }
        Result.success(coupons)
    }

    /** 取单条（用于乐观锁比对与冲突时展示远端值） */
    suspend fun getById(id: String): Result<Coupon?> = withContext(Dispatchers.IO) {
        val token = auth.ensureToken()
            ?: return@withContext Result.failure(CloudException("未登录或登录已过期"))
        val url = "${CloudConfig.REST_BASE}/${CloudConfig.TABLE_COUPONS}?select=*&id=eq.$id"
        val (code, payload) = request("GET", url, token)
        if (code !in 200..299) {
            return@withContext Result.failure(CloudException(errorText(code, payload, "读取云端记录失败")))
        }
        val array = payload?.let { runCatching { it.jsonArray }.getOrNull() } ?: return@withContext Result.success(null)
        Result.success(array.firstOrNull()?.let { rowToCoupon(it.jsonObject) })
    }

    // ------------------------------------------------------------------ 写

    suspend fun insert(coupon: Coupon): Result<Unit> = withContext(Dispatchers.IO) {
        val token = auth.ensureToken()
            ?: return@withContext Result.failure(CloudException("未登录或登录已过期"))
        val url = "${CloudConfig.REST_BASE}/${CloudConfig.TABLE_COUPONS}"
        val (code, payload) = request("POST", url, token, couponToRow(coupon))
        if (code !in 200..299) {
            // 409 = 主键已存在，说明别的设备刚建过同一条；交给上层按冲突处理
            val msg = if (code == 409) "记录已存在" else errorText(code, payload, "写入云端失败")
            return@withContext Result.failure(CloudException(msg))
        }
        Result.success(Unit)
    }

    suspend fun update(id: String, row: JsonObject): Result<Unit> = withContext(Dispatchers.IO) {
        val token = auth.ensureToken()
            ?: return@withContext Result.failure(CloudException("未登录或登录已过期"))
        val url = "${CloudConfig.REST_BASE}/${CloudConfig.TABLE_COUPONS}?id=eq.$id"
        val (code, payload) = request("PATCH", url, token, row)
        if (code !in 200..299) {
            return@withContext Result.failure(CloudException(errorText(code, payload, "更新云端失败")))
        }
        Result.success(Unit)
    }

    suspend fun update(coupon: Coupon): Result<Unit> = update(coupon.id, couponToRow(coupon))

    /** 软删除：只打时间戳 */
    suspend fun markDeleted(id: String, at: String): Result<Unit> = withContext(Dispatchers.IO) {
        val row = buildJsonObject {
            put("deleted_at", at)
            put("modified_at", at)
            put("updated_at", at)
        }
        update(id, row)
    }

    // ------------------------------------------------------------------ 原始请求

    private fun request(
        method: String,
        url: String,
        token: String,
        body: JsonObject? = null
    ): Pair<Int, JsonElement?> {
        val builder = Request.Builder()
            .url(url)
            .header(CloudConfig.ACCESS_KEY_HEADER, CloudConfig.PUBLISHABLE_KEY)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
        if (body != null) {
            builder.header("Content-Type", "application/json")
            builder.header("Prefer", "return=minimal")
        }
        when (method) {
            "GET" -> builder.get()
            "POST" -> builder.post(json.encodeToString(JsonObject.serializer(), body!!).toRequestBody(jsonMedia))
            "PATCH" -> builder.patch(json.encodeToString(JsonObject.serializer(), body!!).toRequestBody(jsonMedia))
            else -> error("unsupported method $method")
        }
        return try {
            http.newCall(builder.build()).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                resp.code to (if (text.isBlank()) null else runCatching { json.parseToJsonElement(text) }.getOrNull())
            }
        } catch (e: IOException) {
            -1 to null
        }
    }

    private fun errorText(code: Int, payload: JsonElement?, fallback: String): String {
        val obj = payload?.let { runCatching { it.jsonObject }.getOrNull() }
        val msg = obj?.get("message")?.jsonPrimitive?.contentOrNull
            ?: obj?.get("error_description")?.jsonPrimitive?.contentOrNull
            ?: obj?.get("error")?.jsonPrimitive?.contentOrNull
        if (!msg.isNullOrBlank()) return msg
        return when {
            code == -1 -> "网络不可用，请检查连接"
            code == 401 || code == 403 -> "身份已失效，请重新登录"
            code >= 500 -> "服务端暂时不可用（$code）"
            else -> "$fallback（$code）"
        }
    }

    companion object {
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()

        private val discountNames = mapOf(
            DiscountType.AMOUNT to "amount",
            DiscountType.PERCENTAGE to "percentage",
            DiscountType.FULL to "full",
            DiscountType.GROUP to "group"
        )

        private fun discountCode(type: DiscountType?): String? = type?.let { discountNames[it] }

        private fun discountFrom(value: String?): DiscountType? = when (value) {
            "amount" -> DiscountType.AMOUNT
            "percentage" -> DiscountType.PERCENTAGE
            "full" -> DiscountType.FULL
            "group" -> DiscountType.GROUP
            else -> null
        }

        /** 领域模型 → 云端行（snake_case） */
        fun couponToRow(c: Coupon): JsonObject = buildJsonObject {
            put("id", c.id)
            put("title", c.title)
            put("description", c.description)
            put("discount_type", discountCode(c.discountType))
            put("discount_amount", c.discountAmount)
            put("full_amount", c.fullAmount)
            put("start_date", c.startDate)
            put("end_date", c.endDate)
            put("end_hour", c.endHour)
            put("end_minute", c.endMinute)
            put("is_used", c.isUsed)
            put("notes", c.notes)
            put("created_at", c.createdAt)
            put("updated_at", c.updatedAt)
            put("modified_at", c.modifiedAt)
            // 提醒是"按设备各自提醒"，不参与云端同步
            put("deleted_at", c.deletedAt)
            if (c.version != null) {
                put("version", buildJsonObject {
                    put("deviceId", c.version.deviceId)
                    put("counter", c.version.counter)
                })
            }
        }

        /** 云端行 → 领域模型 */
        fun rowToCoupon(obj: JsonObject): Coupon? {
            val id = obj["id"].str() ?: return null
            val title = obj["title"].str() ?: ""
            return Coupon(
                id = id,
                title = title,
                description = obj["description"].str(),
                discountType = discountFrom(obj["discount_type"].str()),
                discountAmount = obj["discount_amount"].num(),
                fullAmount = obj["full_amount"].num(),
                startDate = obj["start_date"].str() ?: "",
                endDate = obj["end_date"].str() ?: "",
                endHour = obj["end_hour"]?.jsonPrimitive?.intOrNull,
                endMinute = obj["end_minute"]?.jsonPrimitive?.intOrNull,
                isReminded = false,
                remindedDays = emptyList(),
                isUsed = obj["is_used"]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() ?: false,
                notes = obj["notes"].str(),
                createdAt = obj["created_at"].str() ?: "",
                updatedAt = obj["updated_at"].str(),
                version = obj["version"]?.let { v ->
                    runCatching {
                        val vj = v.jsonObject
                        VersionVectorEntry(
                            deviceId = vj["deviceId"]?.jsonPrimitive?.contentOrNull ?: "",
                            counter = vj["counter"]?.jsonPrimitive?.intOrNull ?: 0
                        )
                    }.getOrNull()
                },
                modifiedAt = obj["modified_at"].str(),
                deletedAt = obj["deleted_at"].str()
            )
        }

        private fun JsonElement?.str(): String? {
            if (this == null) return null
            val prim = runCatching { jsonPrimitive }.getOrNull() ?: return null
            if (prim is JsonPrimitive && prim.isString) return prim.content
            return prim.contentOrNull?.takeIf { it.isNotBlank() && it != "null" }
        }

        private fun JsonElement?.num(): Double? {
            if (this == null) return null
            val prim = runCatching { jsonPrimitive }.getOrNull() ?: return null
            return prim.doubleOrNull ?: prim.contentOrNull?.toDoubleOrNull()
        }
    }
}
