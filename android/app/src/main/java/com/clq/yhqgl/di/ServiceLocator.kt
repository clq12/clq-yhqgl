package com.clq.yhqgl.di

import android.content.Context
import com.clq.yhqgl.data.cloud.CloudAuth
import com.clq.yhqgl.data.cloud.CloudSession
import com.clq.yhqgl.data.cloud.CouponCloudApi
import com.clq.yhqgl.data.local.AppDatabase
import com.clq.yhqgl.data.repository.CouponRepository
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.data.sync.BackupEngine
import com.clq.yhqgl.data.sync.CloudSyncEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 极简服务容器。
 *
 * 项目里 Hilt 已经接好了，但界面一直是「每个 Screen 自己 new 一遍 repository」的写法，
 * 现在依赖变多（云认证、云 API、同步引擎、备份引擎都要共用同一个实例），
 * 再散着 new 会出现多个 OkHttpClient 和互不相通的会话状态。
 *
 * 所以先收敛到一个容器：够用、没有反射开销、也不用改 ARCH。</br>
 * 之后要全部换成 Hilt 注入，只改这一个文件 + 各 Screen 的取用方式即可。
 */
object ServiceLocator {

    private lateinit var appContext: Context

    val database: AppDatabase by lazy { AppDatabase.getInstance(appContext) }
    val settingsStore: SettingsStore by lazy { SettingsStore(appContext) }
    val cloudAuth: CloudAuth by lazy { CloudAuth(appContext) }
    val cloudApi: CouponCloudApi by lazy { CouponCloudApi(cloudAuth) }
    val syncEngine: CloudSyncEngine by lazy {
        CloudSyncEngine(appContext, database.couponDao(), cloudApi, cloudAuth)
    }
    val backupEngine: BackupEngine by lazy {
        BackupEngine(appContext, database.couponDao(), settingsStore, cloudApi, cloudAuth, syncEngine)
    }
    val repository: CouponRepository by lazy {
        CouponRepository(database.couponDao(), settingsStore, cloudApi, cloudAuth, syncEngine, backupEngine)
    }

    private val _session = MutableStateFlow<CloudSession?>(null)
    /** 当前登录态。null = 游客本地模式（功能可用，只是不上云）。 */
    val session: StateFlow<CloudSession?> = _session.asStateFlow()

    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    fun init(context: Context) {
        appContext = context.applicationContext
        _session.value = cloudAuth.currentSession()
    }

    fun updateSession(session: CloudSession?) {
        _session.value = session
    }

    fun setSyncing(value: Boolean) {
        _syncing.value = value
    }

    val isSignedIn: Boolean get() = _session.value != null
}
