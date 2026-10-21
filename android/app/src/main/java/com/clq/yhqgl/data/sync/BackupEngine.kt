package com.clq.yhqgl.data.sync

import android.content.Context
import com.clq.yhqgl.data.cloud.CloudAuth
import com.clq.yhqgl.data.cloud.CouponCloudApi
import com.clq.yhqgl.data.local.CouponDao
import com.clq.yhqgl.data.local.toEntity
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.CouponDataPackage
import kotlinx.serialization.json.Json

/** 备份/恢复的结果 */
data class BackupReport(
    val count: Int = 0,
    val path: String? = null,
    val error: String? = null
) {
    val ok: Boolean get() = error == null
}

/**
 * WebDAV 备份通道。
 *
 * 注意它现在的定位：**只是备份**，不是同步。
 * 云数据库才是真相源，这里只有用户手动点的两个动作：
 * - [backup]  把当前云数据导出一份快照到 WebDAV（含时间戳，不覆盖历史）
 * - [restore] 从 WebDAV 读一份快照，覆盖云端 + 本地
 *
 * 不做自动备份、不做双向合并 —— 合并是上一版的设计，已经废弃。
 */
class BackupEngine(
    private val context: Context,
    private val dao: CouponDao,
    private val settingsStore: SettingsStore,
    private val api: CouponCloudApi,
    private val auth: CloudAuth,
    private val sync: CloudSyncEngine
) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    private fun client(): WebDAVClient? {
        val s = settingsStore.webdav ?: return null
        if (s.url.isBlank()) return null
        return WebDAVClient(s.url, s.username, s.password)
    }

    private fun rootPath(): String = settingsStore.webdav?.rootPath?.trim('/')?.ifBlank { "yhqgl/v2" } ?: "yhqgl/v2"

    /** 备份：从云端拉最新数据，写 data.json + 带时间戳的快照 */
    suspend fun backup(): BackupReport {
        val client = client() ?: return BackupReport(error = "还没配置 WebDAV")
        val remote = api.listAll().getOrElse { e ->
            return BackupReport(error = e.message ?: "拉取云端数据失败")
        }
        val active = remote.filter { it.deletedAt == null }
        if (active.isEmpty()) return BackupReport(error = "云端没有可备份的数据")

        val pkg = CouponDataPackage(
            schemaVersion = Coupon.SCHEMA_VERSION,
            coupons = active,
            deletedIds = remote.filter { it.deletedAt != null }.map { it.id }
        )
        val payload = json.encodeToString(CouponDataPackage.serializer(), pkg)

        val root = rootPath()
        client.mkcol(root)
        client.mkcol("$root/backups")

        val latest = "$root/data.json"
        val stamp = sync.nowIso().replace(":", "-").take(19)
        val snapshot = "$root/backups/backup-$stamp.json"

        if (!client.put(latest, payload)) return BackupReport(error = "写入 $latest 失败")
        // 快照失败不算致命，至少最新那份已经写进去了
        client.put(snapshot, payload)

        return BackupReport(count = active.size, path = snapshot)
    }

    /**
     * 恢复（覆盖语义）：读 data.json，把云端与本地都替换成里面那份。
     *
     * 覆盖 = 云端有、备份里没有的记录会被软删除。这是用户明确点的按钮，
     * 所以不再二次确认，但界面上要写清楚。
     */
    suspend fun restore(): BackupReport {
        val client = client() ?: return BackupReport(error = "还没配置 WebDAV")
        val root = rootPath()
        val raw = client.get("$root/data.json")
            ?: return BackupReport(error = "WebDAV 上没有找到 data.json")

        val pkg = runCatching { json.decodeFromString(CouponDataPackage.serializer(), raw) }
            .getOrElse { return BackupReport(error = "备份文件格式不对，无法解析") }
        if (pkg.coupons.isEmpty()) return BackupReport(error = "备份里没有优惠券")

        val session = auth.currentSession()
            ?: return BackupReport(error = "请先登录云账号再恢复")

        val now = sync.nowIso()
        val backupIds = pkg.coupons.map { it.id }.toSet()

        val remote = api.listAll().getOrElse { e ->
            return BackupReport(error = e.message ?: "读取云端现状失败")
        }

        // 1. 云端有、备份里没有 → 软删除（这就是"覆盖"）
        for (row in remote) {
            if (row.id !in backupIds && row.deletedAt == null) {
                api.markDeleted(row.id, now)
            }
        }

        // 2. 备份里的每一条写回云端，并把 modified_at 推到当前时刻，
        //    否则下次同步会被旧的乐观锁判成"过期数据"
        var written = 0
        for (coupon in pkg.coupons) {
            val restored = coupon.copy(
                deletedAt = null,
                modifiedAt = now,
                updatedAt = now,
                isReminded = false,
                remindedDays = emptyList()
            )
            val existing = remote.any { it.id == restored.id }
            val result = if (existing) api.update(restored) else api.insert(restored)
            if (result.isSuccess) written += 1
        }

        // 3. 本地清空后按云端重建，同时保留各设备自己的提醒状态
        val localReminders = dao.getAllIncludingDeleted().associateBy { it.id }
        dao.clear()
        val finalRows = api.listAll().getOrElse { e ->
            return BackupReport(error = e.message ?: "恢复后重新拉取失败")
        }
        finalRows
            .filter { it.deletedAt == null }
            .forEach { row ->
                val local = localReminders[row.id]
                dao.insert(
                    row.copy(
                        isReminded = local?.isReminded ?: false,
                        remindedDays = local?.toDomain()?.remindedDays ?: emptyList()
                    ).toEntity(dirty = false, ownerId = session.userId)
                )
            }

        return BackupReport(count = written, path = "$root/data.json")
    }
}
