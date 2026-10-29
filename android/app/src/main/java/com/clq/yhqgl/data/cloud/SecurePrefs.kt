package com.clq.yhqgl.data.cloud

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.io.File

/**
 * 带降级兜底的本地偏好存储。
 *
 * 为什么需要这一层：`EncryptedSharedPreferences` 依赖 Android Keystore，而有几类
 * 真实会发生的场景会让它**建不出来或读不出来**：
 *
 * 1. 从备份恢复（`android:allowBackup="true"` 把 SharedPreferences 文件还原了，
 *    但 Keystore 里的主密钥跟着旧设备一起没了）；
 * 2. 用户「清除数据」后再恢复、或系统升级导致 Keystore 条目失效；
 * 3. 部分定制 ROM 的 Keystore 实现异常（`AEADBadTagException` / `InvalidKeyException`）。
 *
 * 原来的写法在 `ServiceLocator.init()` 里直接 `CloudAuth` → `EncryptedSharedPreferences.create`，
 * 一旦抛异常就是**应用启动即崩溃**——用户看到的现象正好是「打不开、也登录不了」。
 *
 * 现在的策略：
 * - 能用加密就用加密（`encrypted = true`）；
 * - 建不出来就**删掉那份坏掉的加密文件**，退到普通 SharedPreferences（`*.fallback`），
 *   宁可牺牲一点静态加密的强度，也不能让 App 起不来；
 * - 每次读写都套 try/catch：单条记录读坏只当作「没有」，不把异常抛到界面层。
 *
 * 代价是会话可能需要在降级后重新登录一次，这是可接受的——总比闪退强。
 */
object SecurePrefs {

    /** 是否已从加密存储降级到普通存储（供设置页提示用户） */
    @Volatile
    var degraded: Boolean = false
        private set

    fun open(context: Context, name: String): SharedPreferences {
        val app = context.applicationContext
        val created = runCatching {
            val masterKey = MasterKey.Builder(app)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                app,
                name,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }.getOrNull()

        if (created != null) {
            // 建得出来不代表读得出来：这里探一次，读失败同样按降级处理
            val readable = runCatching { created.all }.isSuccess
            if (readable) return SafePrefs(created, encrypted = true)
        }

        degraded = true
        // 坏掉的文件不清掉，下次启动还会再崩一次
        runCatching { deleteEncryptedFile(app, name) }
        val fallback = app.getSharedPreferences(FALLBACK_SUFFIX + name, Context.MODE_PRIVATE)
        return SafePrefs(fallback, encrypted = false)
    }

    private fun deleteEncryptedFile(app: Context, name: String) {
        // EncryptedSharedPreferences 的实际落盘位置是 shared_prefs/<name>.xml
        val dir = File(app.applicationInfo.dataDir, "shared_prefs")
        File(dir, "$name.xml").delete()
        runCatching { app.deleteSharedPreferences(name) }
    }

    private const val FALLBACK_SUFFIX = "fallback_"
}

/**
 * 把 `SharedPreferences` 的读写都包一层 try/catch。
 *
 * 只包读不够：写入时同样可能抛（Keystore 刚好在这一刻失效），
 * 而写失败的后果只是「这次没保存上」，不该连锁崩掉调用方的界面。
 */
private class SafePrefs(
    private val delegate: SharedPreferences,
    val encrypted: Boolean
) : SharedPreferences {

    override fun getAll(): MutableMap<String, *> =
        runCatching { delegate.all }.getOrDefault(mutableMapOf<String, Any?>())

    override fun getString(key: String?, defValue: String?): String? =
        runCatching { delegate.getString(key, defValue) }.getOrDefault(defValue)

    override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
        runCatching { delegate.getStringSet(key, defValues) }.getOrDefault(defValues)

    override fun getInt(key: String?, defValue: Int): Int =
        runCatching { delegate.getInt(key, defValue) }.getOrDefault(defValue)

    override fun getLong(key: String?, defValue: Long): Long =
        runCatching { delegate.getLong(key, defValue) }.getOrDefault(defValue)

    override fun getFloat(key: String?, defValue: Float): Float =
        runCatching { delegate.getFloat(key, defValue) }.getOrDefault(defValue)

    override fun getBoolean(key: String?, defValue: Boolean): Boolean =
        runCatching { delegate.getBoolean(key, defValue) }.getOrDefault(defValue)

    override fun contains(key: String?): Boolean =
        runCatching { delegate.contains(key) }.getOrDefault(false)

    override fun edit(): SharedPreferences.Editor = SafeEditor(delegate.edit())

    override fun registerOnSharedPreferenceChangeListener(
        listener: SharedPreferences.OnSharedPreferenceChangeListener?
    ) = runCatching { delegate.registerOnSharedPreferenceChangeListener(listener) }.getOrNull() ?: Unit

    override fun unregisterOnSharedPreferenceChangeListener(
        listener: SharedPreferences.OnSharedPreferenceChangeListener?
    ) = runCatching { delegate.unregisterOnSharedPreferenceChangeListener(listener) }.getOrNull() ?: Unit
}

private class SafeEditor(private val delegate: SharedPreferences.Editor) : SharedPreferences.Editor {

    override fun putString(key: String?, value: String?): SharedPreferences.Editor =
        apply { runCatching { delegate.putString(key, value) } }

    override fun putStringSet(key: String?, values: MutableSet<String>?): SharedPreferences.Editor =
        apply { runCatching { delegate.putStringSet(key, values) } }

    override fun putInt(key: String?, value: Int): SharedPreferences.Editor =
        apply { runCatching { delegate.putInt(key, value) } }

    override fun putLong(key: String?, value: Long): SharedPreferences.Editor =
        apply { runCatching { delegate.putLong(key, value) } }

    override fun putFloat(key: String?, value: Float): SharedPreferences.Editor =
        apply { runCatching { delegate.putFloat(key, value) } }

    override fun putBoolean(key: String?, value: Boolean): SharedPreferences.Editor =
        apply { runCatching { delegate.putBoolean(key, value) } }

    override fun remove(key: String?): SharedPreferences.Editor =
        apply { runCatching { delegate.remove(key) } }

    override fun clear(): SharedPreferences.Editor =
        apply { runCatching { delegate.clear() } }

    override fun commit(): Boolean = runCatching { delegate.commit() }.getOrDefault(false)

    override fun apply() = runCatching { delegate.apply() }.getOrNull() ?: Unit
}
