package com.clq.yhqgl.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface CouponDao {

    /** 列表用的查询：已软删除的不出现 */
    @Query("SELECT * FROM coupons WHERE deletedAt IS NULL ORDER BY endDate ASC, endHour ASC, endMinute ASC")
    fun observeAll(): Flow<List<CouponEntity>>

    @Query("SELECT * FROM coupons WHERE deletedAt IS NULL ORDER BY endDate ASC")
    suspend fun getAllActive(): List<CouponEntity>

    /** 同步用：包含墓碑，否则无法把删除传播出去 */
    @Query("SELECT * FROM coupons ORDER BY endDate ASC")
    suspend fun getAllIncludingDeleted(): List<CouponEntity>

    /** 待补传队列 */
    @Query("SELECT * FROM coupons WHERE dirty = 1")
    suspend fun getDirty(): List<CouponEntity>

    @Query("SELECT COUNT(*) FROM coupons WHERE dirty = 1")
    suspend fun dirtyCount(): Int

    /** 「待解决」列表：上次补传被乐观锁拦下的记录 */
    @Query("SELECT * FROM coupons WHERE conflict = 1")
    fun observeConflicts(): Flow<List<CouponEntity>>

    @Query("SELECT * FROM coupons WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): CouponEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: CouponEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(entities: List<CouponEntity>)

    @Update
    suspend fun update(entity: CouponEntity)

    @Query("DELETE FROM coupons WHERE id = :id")
    suspend fun hardDelete(id: String)

    @Query("DELETE FROM coupons")
    suspend fun clear()

    @Query("UPDATE coupons SET dirty = 0, conflict = 0 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("UPDATE coupons SET dirty = 0, conflict = 0")
    suspend fun markAllSynced()

    @Query("UPDATE coupons SET conflict = 1, dirty = 0 WHERE id = :id")
    suspend fun markConflict(id: String)

    /** 已同步过的墓碑没必要一直留着 */
    @Query("DELETE FROM coupons WHERE deletedAt IS NOT NULL AND dirty = 0")
    suspend fun purgeSyncedTombstones()

    /** 把游客数据（ownerId 为 null）认领给当前账号 */
    @Query("UPDATE coupons SET ownerId = :ownerId WHERE ownerId IS NULL")
    suspend fun claimOrphans(ownerId: String)

    /** 属于别的账号的本地残留，登录新账号时必须清掉，避免串号 */
    @Query("DELETE FROM coupons WHERE ownerId IS NOT NULL AND ownerId != :ownerId")
    suspend fun dropForeign(ownerId: String)

    @Query("SELECT COUNT(*) FROM coupons WHERE ownerId IS NOT NULL AND ownerId != :ownerId")
    suspend fun foreignCount(ownerId: String): Int
}
