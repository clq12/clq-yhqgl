package com.clq.yhqgl.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
 interface CouponDao {

    @Query("SELECT * FROM coupons WHERE isDeleted = 0 ORDER BY endDate ASC, endHour ASC, endMinute ASC")
    fun observeAll(): Flow<List<CouponEntity>>

    @Query("SELECT * FROM coupons WHERE isDeleted = 0 ORDER BY endDate ASC")
    suspend fun getAll(): List<CouponEntity>

    @Query("SELECT * FROM coupons ORDER BY endDate ASC")
    suspend fun getAllWithDeleted(): List<CouponEntity>

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
}
