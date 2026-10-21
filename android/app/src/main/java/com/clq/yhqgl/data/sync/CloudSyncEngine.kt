package com.clq.yhqgl.data.sync

import android.content.Context
import android.provider.Settings
import com.clq.yhqgl.data.cloud.CloudAuth
import com.clq.yhqgl.data.cloud.CouponCloudApi
import com.clq.yhqgl.data.local.CouponDao
import com.clq.yhqgl.data.local.toEntity
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.VersionVectorEntry
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** 一次同步的结果，用来在界面上说人话 */
data class SyncReport(
    val pushed: Int = 0,
    val pulled: Int = 0,
    val deleted: Int = 0,
    /** 云端版本更新、本次写入被拦下的条数 */
    val conflicts: Int = 0,
    /** 网络/服务端失败条数 */
    val failed: Int = 0,
    val totalActive: Int = 0,
    val error: String? = null
) {
    val ok: Boolean get() = error == null
}

/**
 * 云同步引擎。
 *
 * 只有一个真相源：云端 coupons 表。本地 Room 是缓存 + 离线写缓冲。
 *
 * 一轮同步的顺序是「先推后拉」：
 * 1. 把本地 dirty 队列推上云（乐观锁：云端 modified_at 更新则整条拦下并标 conflict）
 * 2. 把云端有、本地没有的拉下来
 * 3. 清掉已同步的墓碑
 *
 * 提醒字段（isReminded / remindedDays）**不参与同步** —— 提醒是按设备各自计算的，
 * 同步过去会让另一台设备以为自己已经提醒过。
 */
class CloudSyncEngine(
    private val context: Context,
    private val dao: CouponDao,
    private val api: CouponCloudApi,
    private val auth: CloudAuth
) {
    private val iso = DateTimeFormatter.ISO_OFFSET_DATE_TIME.withZone(ZoneOffset.ofHours(8))

    fun deviceId(): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "android-install"

    fun nowIso(): String = iso.format(Instant.now())

    /** 写前调用：递增版本向量并刷新修改时间 */
    fun bumpVersion(coupon: Coupon): Coupon = coupon.copy(
        version = VersionVectorEntry(deviceId(), (coupon.version?.counter ?: 0) + 1),
        modifiedAt = nowIso(),
        updatedAt = nowIso()
    )

    suspend fun sync(): SyncReport {
        val session = auth.currentSession()
            ?: return SyncReport(error = "未登录云账号")

        val remoteResult = api.listAll()
        val remoteList = remoteResult.getOrElse { e ->
            return SyncReport(error = e.message ?: "拉取云端数据失败")
        }
        val remoteMap = remoteList.associateBy { it.id }
        val localList = dao.getAllIncludingDeleted()
        val localMap = localList.associateBy { it.id }

        var pushed = 0
        var deleted = 0
        var conflicts = 0
        var failed = 0

        // ---------- 1. 推：本地 dirty 队列 ----------
        for (entity in localList) {
            if (!entity.dirty) continue
            // 同账号才认领：属于别的账号的本地残留一律不推
            if (entity.ownerId != null && entity.ownerId != session.userId) continue

            val local = entity.toDomain()
            val remote = remoteMap[local.id]
            val localTime = parseTime(local.modifiedAt)

            if (local.deletedAt != null) {
                if (remote == null) {
                    dao.markSynced(local.id)
                } else if (parseTime(remote.modifiedAt) > localTime) {
                    dao.markConflict(local.id)
                    conflicts += 1
                } else {
                    val at = local.deletedAt
                    api.markDeleted(local.id, at)
                        .onSuccess { dao.markSynced(local.id); deleted += 1 }
                        .onFailure { failed += 1 }
                }
                continue
            }

            val result = when {
                remote == null -> api.insert(local)
                parseTime(remote.modifiedAt) > localTime -> {
                    // 乐观锁：云端更晚才被改过，不覆盖
                    dao.markConflict(local.id)
                    conflicts += 1
                    null
                }
                else -> api.update(local)
            }
            when {
                result == null -> Unit
                result.isSuccess -> {
                    dao.markSynced(local.id)
                    pushed += 1
                }
                else -> {
                    failed += 1
                }
            }
        }

        // ---------- 2. 拉：云端有、本地没有（或本地干净）的 ----------
        var pulled = 0
        for (remote in remoteMap.values) {
            val localEntity = localMap[remote.id]

            if (remote.deletedAt != null) {
                // 云端已删：本地没这条就不用管；有的话跟着打标
                if (localEntity != null && localEntity.deletedAt == null) {
                    if (localEntity.dirty) {
                        // 本地还有未上传的修改，和删除撞上了 —— 交给用户裁决
                        dao.markConflict(localEntity.id)
                        conflicts += 1
                    } else {
                        dao.insert(remote.copy(deletedAt = remote.deletedAt).toEntity(ownerId = session.userId))
                        pulled += 1
                    }
                }
                continue
            }

            if (localEntity == null) {
                dao.insert(
                    remote.copy(
                        isReminded = false,
                        remindedDays = emptyList()
                    ).toEntity(dirty = false, ownerId = session.userId)
                )
                pulled += 1
            } else if (!localEntity.dirty && !localEntity.conflict) {
                // 本地干净就以云端为准，但提醒状态留在本地
                dao.insert(
                    remote.copy(
                        isReminded = localEntity.isReminded,
                        remindedDays = localEntity.toDomain().remindedDays
                    ).toEntity(dirty = false, ownerId = session.userId)
                )
            }
        }

        // ---------- 3. 收尾 ----------
        dao.purgeSyncedTombstones()

        return SyncReport(
            pushed = pushed,
            pulled = pulled,
            deleted = deleted,
            conflicts = conflicts,
            failed = failed,
            totalActive = dao.getAllActive().size
        )
    }

    /**
     * 首次登录后的迁移。
     *
     * @param mode UPLOAD 本地优先（把本地待上传的推上去）
     *             PULL_ONLY 只拉云端，本地未上传的改动丢弃
     *             CLEAR_THEN_PULL 先清空本地再拉
     */
    suspend fun initialMigration(mode: MigrationMode): SyncReport {
        val session = auth.currentSession()
            ?: return SyncReport(error = "未登录云账号")

        when (mode) {
            MigrationMode.PULL_ONLY -> {
                // 放弃本地未上传的改动，但仍然保留本地独有的记录？
                // 不保留 —— 用户选的就是「只拉云端」。
                dao.clear()
            }
            MigrationMode.CLEAR_THEN_PULL -> dao.clear()
            MigrationMode.UPLOAD -> {
                dao.claimOrphans(session.userId)
            }
        }
        return sync()
    }

    /**
     * 冲突裁决之一：以本地为准，强推覆盖云端。
     *
     * 与 [sync] 里的推不同，这里**不再比较** modified_at —— 用户已经明确选了本地版本，
     * 所以先把 modified_at 推到当前时刻再写，云端那条会被本地内容覆盖。
     *
     * @return 实际写进云端的那个版本（时间戳已被刷新），调用方要用它回写本地，
     *         否则本地还留着旧的 modified_at，下一轮同步会又被判成冲突。
     */
    suspend fun forcePush(coupon: Coupon): Result<Coupon> {
        val forced = bumpVersion(coupon)
        val remote = api.getById(forced.id).getOrElse { return Result.failure(it) }
        // PATCH 命中 0 行也返回 204，所以先探一次决定用 POST 还是 PATCH
        val write = if (remote == null) api.insert(forced) else api.update(forced)
        return write.map { forced }
    }

    /** 冲突裁决用：取云端当前版本（null 表示云端已经没有这条） */
    suspend fun fetchRemote(id: String): Result<Coupon?> = api.getById(id)

    /** UTC 毫秒。容忍三种写法：带偏移、Z 结尾、无时区（按北京时间解释） */
    fun parseTime(raw: String?): Long {
        if (raw.isNullOrBlank()) return 0L
        return runCatching { OffsetDateTime.parse(raw).toInstant().toEpochMilli() }
            .recoverCatching { Instant.parse(raw).toEpochMilli() }
            .recoverCatching {
                LocalDateTime.parse(raw).toInstant(ZoneOffset.ofHours(8)).toEpochMilli()
            }
            .getOrDefault(0L)
    }
}

enum class MigrationMode {
    /** 上传本地：游客/历史数据认领给当前账号并推上云 */
    UPLOAD,

    /** 只拉云端：放弃本地未上传的改动 */
    PULL_ONLY,

    /** 先清空再拉 */
    CLEAR_THEN_PULL
}
