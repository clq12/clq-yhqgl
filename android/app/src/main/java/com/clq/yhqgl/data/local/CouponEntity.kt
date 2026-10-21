package com.clq.yhqgl.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.DiscountType
import com.clq.yhqgl.model.VersionVectorEntry
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * Room 实体，业务字段与 Coupon 一一对应；后面几列是同步专用的本地状态，不上云。
 *
 * - [deletedAt]：软删除标记，与云端 deleted_at 对应。删除状态只认它。
 * - [dirty]：本地有未上传的改动，补传队列就是它。
 * - [conflict]：上次补传时云端版本更新被拦下，等用户在「待解决」里处理。
 * - [ownerId]：这条记录属于哪个账号。游客模式下为 null；
 *   登录后只有 ownerId 为 null 或等于当前账号时才允许上传（同账号才认领）。
 */
@Entity(tableName = "coupons")
data class CouponEntity(
    @PrimaryKey
    val id: String,
    val title: String,
    val description: String?,
    val discountType: String?,
    val discountAmount: Double?,
    val fullAmount: Double?,
    val startDate: String,
    val endDate: String,
    val endHour: Int?,
    val endMinute: Int?,
    val isReminded: Boolean,
    val remindedDaysJson: String,
    val isUsed: Boolean,
    val notes: String?,
    /** 标签，JSON 数组字面量（如 ["抖音","美团"]），理由同 remindedDaysJson */
    val tagsJson: String,
    val createdAt: String,
    val updatedAt: String?,
    val versionJson: String?,
    val modifiedAt: String?,
    val deletedAt: String?,
    val dirty: Boolean,
    val conflict: Boolean,
    val ownerId: String?
) {
    companion object {
        private val json = Json { ignoreUnknownKeys = true }
    }

    fun toDomain(): Coupon = Coupon(
        id = id,
        title = title,
        description = description,
        discountType = discountType?.let { name -> DiscountType.entries.firstOrNull { it.name == name } },
        discountAmount = discountAmount,
        fullAmount = fullAmount,
        startDate = startDate,
        endDate = endDate,
        endHour = endHour,
        endMinute = endMinute,
        isReminded = isReminded,
        remindedDays = remindedDaysJson.takeIf { it.isNotBlank() }
            ?.let { json.decodeFromString(ListSerializer(Int.serializer()), it) } ?: emptyList(),
        isUsed = isUsed,
        notes = notes,
        tags = tagsJson.takeIf { it.isNotBlank() }
            ?.let { runCatching { json.decodeFromString(ListSerializer(String.serializer()), it) }.getOrNull() }
            ?: emptyList(),
        createdAt = createdAt,
        updatedAt = updatedAt,
        version = versionJson?.let { json.decodeFromString(VersionVectorEntry.serializer(), it) },
        modifiedAt = modifiedAt,
        deletedAt = deletedAt
    )
}

/**
 * 领域模型 → 实体。
 *
 * @param dirty 是否标记为「待上传」。本地新建/修改/删除都置 true，从云端拉回来的置 false。
 * @param conflict 是否处于「待解决」状态。
 * @param ownerId 归属账号；游客数据为 null，登录后按「同账号才认领」规则处理。
 */
fun Coupon.toEntity(
    dirty: Boolean = false,
    conflict: Boolean = false,
    ownerId: String? = null
): CouponEntity = CouponEntity(
    id = id,
    title = title,
    description = description,
    discountType = discountType?.name,
    discountAmount = discountAmount,
    fullAmount = fullAmount,
    startDate = startDate,
    endDate = endDate,
    endHour = endHour,
    endMinute = endMinute,
    isReminded = isReminded,
    remindedDaysJson = Json.encodeToString(ListSerializer(Int.serializer()), remindedDays),
    isUsed = isUsed,
    notes = notes,
    tagsJson = Json.encodeToString(ListSerializer(String.serializer()), tags),
    createdAt = createdAt,
    updatedAt = updatedAt,
    versionJson = version?.let { Json.encodeToString(VersionVectorEntry.serializer(), it) },
    modifiedAt = modifiedAt,
    deletedAt = deletedAt,
    dirty = dirty,
    conflict = conflict,
    ownerId = ownerId
)
