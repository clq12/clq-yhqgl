package com.clq.yhqgl.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [CouponEntity::class],
    version = 2,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun couponDao(): CouponDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        /**
         * v1 → v2：把 isDeleted 布尔换成 deletedAt 时间戳（删除状态只认一个字段），
         * 同时补上同步用的 dirty / conflict / ownerId。
         *
         * 直接重建表而不是 ALTER ADD + 保留 isDeleted：
         * 留着一个不再使用的列，下一个人一定会拿它做判断。
         *
         * 旧数据的处理：
         * - 未删除的标记 dirty=1，登录后会作为「本地历史数据」上传到云；
         * - 已删除的写入 deletedAt、dirty=0 —— 云端从没有过这些记录，不需要传播墓碑。
         */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS coupons_new (
                        id TEXT NOT NULL PRIMARY KEY,
                        title TEXT NOT NULL,
                        description TEXT,
                        discountType TEXT,
                        discountAmount REAL,
                        fullAmount REAL,
                        startDate TEXT NOT NULL,
                        endDate TEXT NOT NULL,
                        endHour INTEGER,
                        endMinute INTEGER,
                        isReminded INTEGER NOT NULL,
                        remindedDaysJson TEXT NOT NULL,
                        isUsed INTEGER NOT NULL,
                        notes TEXT,
                        createdAt TEXT NOT NULL,
                        updatedAt TEXT,
                        versionJson TEXT,
                        modifiedAt TEXT,
                        deletedAt TEXT,
                        dirty INTEGER NOT NULL,
                        conflict INTEGER NOT NULL,
                        ownerId TEXT
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    INSERT INTO coupons_new (
                        id, title, description, discountType, discountAmount, fullAmount,
                        startDate, endDate, endHour, endMinute, isReminded, remindedDaysJson,
                        isUsed, notes, createdAt, updatedAt, versionJson, modifiedAt,
                        deletedAt, dirty, conflict, ownerId
                    )
                    SELECT
                        id, title, description, discountType, discountAmount, fullAmount,
                        startDate, endDate, endHour, endMinute, isReminded, remindedDaysJson,
                        isUsed, notes, createdAt, updatedAt, versionJson, modifiedAt,
                        CASE WHEN isDeleted = 1 THEN COALESCE(modifiedAt, createdAt) ELSE NULL END,
                        CASE WHEN isDeleted = 1 THEN 0 ELSE 1 END,
                        0,
                        NULL
                    FROM coupons
                    """.trimIndent()
                )
                db.execSQL("DROP TABLE coupons")
                db.execSQL("ALTER TABLE coupons_new RENAME TO coupons")
                // 注意：实体上没有声明 @Index，这里绝不能顺手建索引，
                // 否则 Room 的 schema 校验会因「多出来的索引」直接抛异常。
            }
        }

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "yhqgl.db"
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
