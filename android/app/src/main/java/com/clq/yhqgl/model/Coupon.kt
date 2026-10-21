package com.clq.yhqgl.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 优惠券数据模型（v2）
 * 与 shared/schemas/coupon.json 保持一致
 */
@Serializable
 data class Coupon(
    val id: String,
    val title: String,
    val description: String? = null,
    @SerialName("discountType")
    val discountType: DiscountType? = null,
    @SerialName("discountAmount")
    val discountAmount: Double? = null,
    @SerialName("fullAmount")
    val fullAmount: Double? = null,
    @SerialName("startDate")
    val startDate: String, // YYYY-MM-DD
    @SerialName("endDate")
    val endDate: String,   // YYYY-MM-DD
    @SerialName("endHour")
    val endHour: Int? = 23,
    @SerialName("endMinute")
    val endMinute: Int? = 59,
    @SerialName("isReminded")
    val isReminded: Boolean = false,
    @SerialName("remindedDays")
    val remindedDays: List<Int> = emptyList(),
    @SerialName("isUsed")
    val isUsed: Boolean = false,
    val notes: String? = null,
    @SerialName("createdAt")
    val createdAt: String,
    @SerialName("updatedAt")
    val updatedAt: String? = null,
    val version: VersionVectorEntry? = null,
    @SerialName("modifiedAt")
    val modifiedAt: String? = null,
    /**
     * 软删除标记：非 null 表示已删除。
     * 删除状态只认这一个字段，[isDeleted] 是它的派生。
     */
    @SerialName("deletedAt")
    val deletedAt: String? = null
) {
    /** 是否已删除（派生属性，不参与序列化） */
    val isDeleted: Boolean get() = deletedAt != null

    companion object {
        const val SCHEMA_VERSION = 2
    }
}

@Serializable
 enum class DiscountType {
    @SerialName("amount") AMOUNT,
    @SerialName("percentage") PERCENTAGE,
    @SerialName("full") FULL,
    @SerialName("group") GROUP
}

/**
 * 单设备版本条目
 */
@Serializable
 data class VersionVectorEntry(
    @SerialName("deviceId")
    val deviceId: String,
    val counter: Int
)

/**
 * WebDAV 上存储的全量数据包
 */
@Serializable
 data class CouponDataPackage(
    @SerialName("schemaVersion")
    val schemaVersion: Int = Coupon.SCHEMA_VERSION,
    val coupons: List<Coupon> = emptyList(),
    @SerialName("deletedIds")
    val deletedIds: List<String> = emptyList()
)

/**
 * 同步元数据
 */
@Serializable
 data class SyncCheckpoint(
    @SerialName("schemaVersion")
    val schemaVersion: Int = 2,
    @SerialName("deviceId")
    val deviceId: String,
    @SerialName("deviceName")
    val deviceName: String? = null,
    @SerialName("vectorClock")
    val vectorClock: Map<String, Int> = emptyMap(),
    @SerialName("lastSyncAt")
    val lastSyncAt: String? = null,
    @SerialName("pendingChanges")
    val pendingChanges: Int = 0,
    @SerialName("conflictCount")
    val conflictCount: Int = 0
)
