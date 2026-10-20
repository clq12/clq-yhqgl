package com.clq.yhqgl.data.model

import com.clq.yhqgl.model.Coupon as SchemaCoupon
import com.clq.yhqgl.model.DiscountType
import com.clq.yhqgl.model.VersionVectorEntry
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * 领域层 Coupon，与 shared/schemas/coupon.json 完全一致
 */
 data class Coupon(
    val id: String = UUID.randomUUID().toString(),
    val title: String,
    val description: String? = null,
    val discountType: DiscountType? = null,
    val discountAmount: Double? = null,
    val fullAmount: Double? = null,
    val startDate: String,
    val endDate: String,
    val endHour: Int? = 23,
    val endMinute: Int? = 59,
    val isReminded: Boolean = false,
    val remindedDays: List<Int> = emptyList(),
    val isUsed: Boolean = false,
    val notes: String? = null,
    val createdAt: String = nowIso(),
    val updatedAt: String? = null,
    val version: VersionVectorEntry? = null,
    val modifiedAt: String? = null,
    val isDeleted: Boolean = false
) {
    companion object {
        private val ISO = DateTimeFormatter.ISO_OFFSET_DATE_TIME.withZone(ZoneOffset.ofHours(8))
        fun nowIso(): String = ISO.format(Instant.now())
    }

    fun toSchema(): SchemaCoupon = SchemaCoupon(
        id = id,
        title = title,
        description = description,
        discountType = discountType,
        discountAmount = discountAmount,
        fullAmount = fullAmount,
        startDate = startDate,
        endDate = endDate,
        endHour = endHour,
        endMinute = endMinute,
        isReminded = isReminded,
        remindedDays = remindedDays,
        isUsed = isUsed,
        notes = notes,
        createdAt = createdAt,
        updatedAt = updatedAt,
        version = version,
        modifiedAt = modifiedAt
    )
}

fun SchemaCoupon.toDomain(): Coupon = Coupon(
    id = id,
    title = title,
    description = description,
    discountType = discountType,
    discountAmount = discountAmount,
    fullAmount = fullAmount,
    startDate = startDate,
    endDate = endDate,
    endHour = endHour,
    endMinute = endMinute,
    isReminded = isReminded,
    remindedDays = remindedDays,
    isUsed = isUsed,
    notes = notes,
    createdAt = createdAt,
    updatedAt = updatedAt,
    version = version,
    modifiedAt = modifiedAt
)
