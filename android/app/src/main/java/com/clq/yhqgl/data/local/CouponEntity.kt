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
 * Room 实体，字段与 Coupon 一一对应
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
    val createdAt: String,
    val updatedAt: String?,
    val versionJson: String?,
    val modifiedAt: String?,
    val isDeleted: Boolean
) {
    companion object {
        private val json = Json { ignoreUnknownKeys = true }
    }

    fun toDomain(): Coupon = Coupon(
        id = id,
        title = title,
        description = description,
        discountType = discountType?.let { DiscountType.valueOf(it) },
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
        createdAt = createdAt,
        updatedAt = updatedAt,
        version = versionJson?.let { json.decodeFromString(VersionVectorEntry.serializer(), it) },
        modifiedAt = modifiedAt,
        isDeleted = isDeleted
    )
}

fun Coupon.toEntity(): CouponEntity = CouponEntity(
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
    createdAt = createdAt,
    updatedAt = updatedAt,
    versionJson = version?.let { Json.encodeToString(VersionVectorEntry.serializer(), it) },
    modifiedAt = modifiedAt,
    isDeleted = isDeleted
)
