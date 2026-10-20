package com.clq.yhqgl.data.sync

import android.content.Context
import android.provider.Settings
import com.clq.yhqgl.data.local.CouponDao
import com.clq.yhqgl.data.local.toEntity
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.model.CouponDataPackage
import com.clq.yhqgl.model.SyncCheckpoint
import com.clq.yhqgl.model.VersionVectorEntry
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * WebDAV 双向同步引擎（版本向量 + 字段级合并）
 */
 class SyncEngine(
    private val context: Context,
    private val dao: CouponDao,
    private val settingsStore: SettingsStore
) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }
    private val iso = DateTimeFormatter.ISO_OFFSET_DATE_TIME.withZone(ZoneOffset.ofHours(8))

    private fun deviceId(): String {
        return Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "android-${System.currentTimeMillis()}"
    }

    private fun now(): String = iso.format(Instant.now())

    private fun webdav(): WebDAVClient? {
        val s = settingsStore.webdav ?: return null
        return WebDAVClient(s.url, s.username, s.password)
    }

    /**
     * 执行同步
     */
    suspend fun sync(): Result<SyncCheckpoint> {
        val client = webdav() ?: return Result.failure(IllegalStateException("WebDAV 未配置"))
        val root = settingsStore.webdav?.rootPath?.trim('/') ?: "yhqgl/v2"
        val dataPath = "$root/data.json"
        val syncPath = "$root/sync.json"

        // 确保目录存在
        client.mkcol(root)
        client.mkcol("$root/backups")

        // 读取远程
        val remoteData = client.get(dataPath)?.let {
            json.decodeFromString(CouponDataPackage.serializer(), it)
        } ?: CouponDataPackage()
        val remoteSync = client.get(syncPath)?.let {
            json.decodeFromString(SyncCheckpoint.serializer(), it)
        }

        // 读取本地
        val localEntities = dao.getAllWithDeleted()
        val localMap = localEntities.associateBy { it.id }.mapValues { it.value.toDomain() }
        val remoteMap = remoteData.coupons.associateBy { it.id }

        // 合并
        val merged = mutableListOf<Coupon>()
        val deletedIds = mutableSetOf<String>()
        var conflictCount = 0
        val allIds = (localMap.keys + remoteMap.keys + remoteData.deletedIds).toSet()

        for (id in allIds) {
            val local = localMap[id]
            val remote = remoteMap[id]
            val remoteDeleted = remoteData.deletedIds.contains(id)
            val localDeleted = local?.isDeleted == true

            when {
                local == null && remote != null && !remoteDeleted -> merged.add(remote)
                remote == null && local != null && !localDeleted -> merged.add(local)
                local != null && remote != null -> {
                    val (winner, wasConflict) = mergeRecords(local, remote)
                    if (wasConflict) conflictCount++
                    if (!winner.isDeleted) merged.add(winner)
                    else deletedIds.add(id)
                }
                localDeleted && !remoteDeleted -> deletedIds.add(id)
                remoteDeleted && (local == null || localDeleted) -> deletedIds.add(id)
            }
        }

        // 更新向量时钟
        val vectorClock = (remoteSync?.vectorClock ?: emptyMap()).toMutableMap()
        val myOld = vectorClock[deviceId()] ?: 0
        vectorClock[deviceId()] = myOld + 1

        val newSync = SyncCheckpoint(
            deviceId = deviceId(),
            deviceName = android.os.Build.MODEL,
            vectorClock = vectorClock,
            lastSyncAt = now(),
            pendingChanges = 0,
            conflictCount = conflictCount
        )

        val newData = CouponDataPackage(
            coupons = merged,
            deletedIds = deletedIds.toList()
        )

        // 上传
        val dataOk = client.put(dataPath, json.encodeToString(CouponDataPackage.serializer(), newData))
        val syncOk = client.put(syncPath, json.encodeToString(SyncCheckpoint.serializer(), newSync))

        if (!dataOk || !syncOk) {
            return Result.failure(IllegalStateException("上传同步数据失败"))
        }

        // 写回本地
        dao.clear()
        dao.insertAll(merged.map { it.toEntity() })

        return Result.success(newSync)
    }

    /**
     * 合并单条记录
     */
    private fun mergeRecords(local: Coupon, remote: Coupon): Pair<Coupon, Boolean> {
        // 简单版本比较：若 deviceId 相同，counter 大者新
        val localV = local.version
        val remoteV = remote.version

        return when {
            localV == null && remoteV == null -> remote to false
            localV == null -> remote to false
            remoteV == null -> local to false
            localV.deviceId == remoteV.deviceId -> {
                if (localV.counter >= remoteV.counter) local to false else remote to false
            }
            // 默认取 modifiedAt 较新者；若无法判断则视为冲突
            else -> {
                val localTime = local.modifiedAt ?: local.updatedAt ?: local.createdAt
                val remoteTime = remote.modifiedAt ?: remote.updatedAt ?: remote.createdAt
                if (localTime > remoteTime) local to true
                else if (remoteTime > localTime) remote to true
                else if (local.id > remote.id) local to true // 稳定决胜
                else remote to true
            }
        }
    }

    /**
     * 本地发生变更时调用，增加版本号
     */
    suspend fun bumpVersion(coupon: Coupon): Coupon {
        val device = deviceId()
        val currentCounter = coupon.version?.counter ?: 0
        return coupon.copy(
            version = VersionVectorEntry(device, currentCounter + 1),
            modifiedAt = now(),
            updatedAt = now()
        )
    }
}
