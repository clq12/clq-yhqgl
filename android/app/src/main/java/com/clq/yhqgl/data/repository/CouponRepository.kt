package com.clq.yhqgl.data.repository

import android.content.Context
import com.clq.yhqgl.data.local.CouponDao
import com.clq.yhqgl.data.local.toDomain
import com.clq.yhqgl.data.local.toEntity
import com.clq.yhqgl.data.model.Coupon
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.data.sync.SyncEngine
import com.clq.yhqgl.rules.CouponRules
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * 优惠券数据仓库：本地数据库 + WebDAV 同步
 */
 class CouponRepository(
    context: Context,
    private val dao: CouponDao,
    private val settingsStore: SettingsStore
) {
    private val syncEngine = SyncEngine(context, dao, settingsStore)

    fun observeAll(): Flow<List<Coupon>> = dao.observeAll().map { list ->
        list.map { it.toDomain() }
    }

    suspend fun getById(id: String): Coupon? = dao.getById(id)?.toDomain()

    suspend fun save(coupon: Coupon): Result<Unit> {
        val validation = CouponRules.validate(coupon)
        if (validation.isFailure) {
            return Result.failure(validation.exceptionOrNull()!!)
        }
        val withVersion = syncEngine.bumpVersion(coupon)
        dao.insert(withVersion.toEntity())
        if (settingsStore.settings.sync.autoSync) {
            syncEngine.sync()
        }
        return Result.success(Unit)
    }

    suspend fun delete(coupon: Coupon): Result<Unit> {
        val deleted = coupon.copy(isDeleted = true, version = syncEngine.bumpVersion(coupon).version)
        dao.insert(deleted.toEntity())
        if (settingsStore.settings.sync.autoSync) {
            syncEngine.sync()
        }
        return Result.success(Unit)
    }

    suspend fun markUsed(coupon: Coupon, used: Boolean): Result<Unit> {
        val updated = coupon.copy(isUsed = used).let { syncEngine.bumpVersion(it) }
        dao.insert(updated.toEntity())
        if (settingsStore.settings.sync.autoSync) {
            syncEngine.sync()
        }
        return Result.success(Unit)
    }

    suspend fun sync(): Result<Unit> {
        return syncEngine.sync().map { }
    }
}
