package com.clq.yhqgl.data.repository

import com.clq.yhqgl.data.cloud.CloudAuth
import com.clq.yhqgl.data.cloud.CloudException
import com.clq.yhqgl.data.cloud.CloudSession
import com.clq.yhqgl.data.cloud.CouponCloudApi
import com.clq.yhqgl.data.cloud.OtpChallenge
import com.clq.yhqgl.data.local.CouponDao
import com.clq.yhqgl.data.local.toEntity
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.data.sync.BackupEngine
import com.clq.yhqgl.data.sync.BackupReport
import com.clq.yhqgl.data.sync.CloudSyncEngine
import com.clq.yhqgl.data.sync.MigrationMode
import com.clq.yhqgl.data.sync.SyncReport
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.rules.CouponRules
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * 优惠券数据仓库。
 *
 * 职责边界：
 * - 所有写操作先落本地 Room，并打 dirty 标记（离线优先）
 * - 已登录且开了自动同步时，写完顺手推一次云
 * - 云同步的合并规则全在 [CloudSyncEngine]，这里不重复实现
 */
class CouponRepository(
    private val dao: CouponDao,
    private val settingsStore: SettingsStore,
    private val api: CouponCloudApi,
    private val auth: CloudAuth,
    private val syncEngine: CloudSyncEngine,
    private val backupEngine: BackupEngine
) {
    fun observeAll(): Flow<List<Coupon>> = dao.observeAll().map { list -> list.map { it.toDomain() } }

    /** 「待解决」列表：上次补传被乐观锁拦下的记录 */
    fun observeConflicts(): Flow<List<Coupon>> = dao.observeConflicts().map { list -> list.map { it.toDomain() } }

    suspend fun getById(id: String): Coupon? = dao.getById(id)?.toDomain()

    suspend fun localCount(): Int = dao.getAllActive().size

    /** 一次性取本地全部有效券（标签推荐、AI 上下文这类"读一次就够"的场景用） */
    suspend fun localCoupons(): List<Coupon> = dao.getAllActive().map { it.toDomain() }

    suspend fun pendingCount(): Int = dao.dirtyCount()

    /** 新建或修改。会递增版本向量并打上 dirty，等同步引擎推上去。 */
    suspend fun save(coupon: Coupon): Result<Coupon> {
        CouponRules.validate(coupon).exceptionOrNull()?.let { return Result.failure(it) }

        val existing = dao.getById(coupon.id)
        val session = auth.currentSession()
        // 游客数据 ownerId 保持 null；已登录则盖当前账号
        val ownerId = session?.userId ?: existing?.ownerId

        val bumped = syncEngine.bumpVersion(coupon)
        dao.insert(bumped.toEntity(dirty = true, ownerId = ownerId))
        autoSync()
        return Result.success(bumped)
    }

    /** 软删除：打 deletedAt + dirty，同步时再传播给云端 */
    suspend fun delete(coupon: Coupon): Result<Unit> {
        val existing = dao.getById(coupon.id)
        val session = auth.currentSession()
        val deleted = syncEngine.bumpVersion(coupon.copy(deletedAt = syncEngine.nowIso()))
        dao.insert(
            deleted.toEntity(dirty = true, ownerId = session?.userId ?: existing?.ownerId)
        )
        autoSync()
        return Result.success(Unit)
    }

    suspend fun markUsed(coupon: Coupon, used: Boolean): Result<Unit> {
        val existing = dao.getById(coupon.id)
        val session = auth.currentSession()
        val updated = syncEngine.bumpVersion(coupon.copy(isUsed = used))
        dao.insert(
            updated.toEntity(dirty = true, ownerId = session?.userId ?: existing?.ownerId)
        )
        autoSync()
        return Result.success(Unit)
    }

    /**
     * 记录"这个设备提醒过了"。
     * 提醒状态按设备各自维护，**不**打 dirty、不同步 —— 否则另一台设备会以为自己提醒过。
     */
    suspend fun markReminded(coupon: Coupon, dayMark: Int) {
        val entity = dao.getById(coupon.id) ?: return
        if (entity.remindedDaysJson.contains("\"$dayMark\"") || entity.remindedDaysJson.contains("$dayMark")) {
            // 简单去重，避免同一档位反复写
            dao.insert(entity.copy(isReminded = true))
            return
        }
        val days = coupon.remindedDays.toMutableList().apply { if (!contains(dayMark)) add(dayMark) }
        dao.insert(
            entity.copy(
                isReminded = true,
                remindedDaysJson = days.sorted().joinToString(prefix = "[", postfix = "]", separator = ",")
            )
        )
    }

    // ------------------------------------------------------------------ 账号

    suspend fun sendCode(email: String): Result<OtpChallenge> = auth.sendCode(email)

    /** 验证码登录/注册：`password` 只在「新账号注册」那条路上用得上（默认 123456） */
    suspend fun verifyCode(
        email: String,
        challenge: OtpChallenge,
        code: String,
        password: String? = null
    ): Result<CloudSession> = auth.verifyCode(email, challenge, code, password)

    /** 账号密码登录 */
    suspend fun signInWithPassword(email: String, password: String): Result<CloudSession> =
        auth.signInWithPassword(email, password)

    /** 账号密码注册（前置条件：已拿到 verificationToken） */
    suspend fun signUpWithPassword(
        email: String,
        password: String,
        verificationToken: String
    ): Result<CloudSession> = auth.signUpWithPassword(email, password, verificationToken)

    /** 知道旧密码时直接改密 */
    suspend fun changePassword(oldPassword: String, newPassword: String): Result<CloudSession> =
        auth.changePasswordWithOld(oldPassword, newPassword)

    /** 忘记旧密码：发重置验证码，返回 verificationId */
    suspend fun sendPasswordResetCode(email: String): Result<String> =
        auth.sendPasswordResetCode(email)

    /** 忘记旧密码：验码 + 重置，成功后自动登录 */
    suspend fun resetPassword(
        email: String,
        verificationId: String,
        code: String,
        newPassword: String
    ): Result<CloudSession> = auth.resetPasswordWithCode(email, verificationId, code, newPassword)

    /** 当前账号是否还在用初始默认密码（设置页据此提示改密） */
    val usesDefaultPassword: Boolean get() = auth.usesDefaultPassword

    /** 改密后设置页要刷新账号区展示 */
    val currentEmail: String? get() = auth.currentSession()?.email

    /**
     * 登录成功后的数据处理。
     *
     * 「同账号才认领」：
     * - 从来没登录过（lastOwnerId 为空）→ 本地数据视为可认领的游客数据
     * - 上次登录的就是这个账号 → 直接上传，不打扰用户
     * - 上次登录的是别的账号 → 必须先清掉别人的残留，再按用户选择处理
     */
    suspend fun prepareAfterLogin(previousOwnerId: String?): LoginDataState {
        val session = auth.currentSession()
            ?: return LoginDataState(localCount = 0, needsChoice = false, switchedAccount = false)

        val localCount = dao.getAllActive().size
        val foreign = dao.foreignCount(session.userId)
        val switched = foreign > 0 || (previousOwnerId != null && previousOwnerId != session.userId)

        if (switched) {
            // 属于别的账号的本地残留，绝不能推给新账号
            dao.dropForeign(session.userId)
        }

        val sameAccount = previousOwnerId != null && previousOwnerId == session.userId
        val needsChoice = !sameAccount && dao.getAllActive().isNotEmpty()
        return LoginDataState(
            localCount = localCount,
            needsChoice = needsChoice,
            switchedAccount = switched
        )
    }

    suspend fun finishLoginMigration(mode: MigrationMode): SyncReport {
        val report = syncEngine.initialMigration(mode)
        auth.lastOwnerId = auth.currentSession()?.userId
        return report
    }

    suspend fun logout() {
        auth.signOut()
    }

    // ------------------------------------------------------------------ 同步 / 备份

    suspend fun sync(): Result<SyncReport> {
        if (!auth.isSignedIn()) return Result.failure(CloudException("当前是游客模式，未登录"))
        val report = syncEngine.sync()
        return if (report.ok) Result.success(report) else Result.failure(CloudException(report.error ?: "同步失败"))
    }

    suspend fun backup(): BackupReport = backupEngine.backup()

    suspend fun restore(): BackupReport = backupEngine.restore()

    // ------------------------------------------------------------------ 冲突裁决

    /**
     * 冲突裁决：保留本机版本（强制覆盖云端）。
     *
     * 乐观锁只是"别悄悄覆盖"，不是"永远不许覆盖"。用户看过两边之后选择本地，
     * 就按 [CloudSyncEngine.forcePush] 强推，并把返回的新时间戳回写本地。
     */
    suspend fun resolveKeepLocal(coupon: Coupon): Result<Unit> {
        val session = auth.currentSession()
            ?: return Result.failure(CloudException("当前是游客模式，未登录"))
        val result = syncEngine.forcePush(coupon)
        return result.map { forced ->
            dao.insert(forced.toEntity(dirty = false, conflict = false, ownerId = session.userId))
        }
    }

    /**
     * 冲突裁决：采用云端版本（丢弃本机改动）。
     *
     * 提醒状态仍取本地的 —— 提醒是按设备各自算的，跟内容归属无关。
     * 云端那条不存在了（别的设备刚删掉）时，反过来把本地推上去，避免删了又冒出来。
     */
    suspend fun resolveKeepRemote(coupon: Coupon): Result<Unit> {
        val session = auth.currentSession()
            ?: return Result.failure(CloudException("当前是游客模式，未登录"))
        val remote = syncEngine.fetchRemote(coupon.id).getOrElse { return Result.failure(it) }

        if (remote == null) {
            return syncEngine.forcePush(coupon).map { forced ->
                dao.insert(forced.toEntity(dirty = false, conflict = false, ownerId = session.userId))
            }
        }

        dao.insert(
            remote.copy(
                isReminded = coupon.isReminded,
                remindedDays = coupon.remindedDays
            ).toEntity(dirty = false, conflict = false, ownerId = session.userId)
        )
        return Result.success(Unit)
    }

    /** 冲突卡片上展示"云端版本"用 */
    suspend fun remoteVersionOf(id: String): Result<Coupon?> = syncEngine.fetchRemote(id)

    // ------------------------------------------------------------------ 标签库

    /**
     * 标签改名：把所有券上的旧标签换成新名字（与已有标签重复就合并）。
     *
     * 标签是冗余存在每张券上的，只改设置里的名单会在券上留下旧名字，
     * 结果就是「列表里筛得出来、标签库里却没有」的幽灵标签。
     *
     * @return 实际改动的券数
     */
    suspend fun renameTag(oldTag: String, newTag: String): Int {
        val from = CouponRules.normalizeTag(oldTag) ?: return 0
        val to = CouponRules.normalizeTag(newTag) ?: return 0
        if (from == to) return 0
        return rewriteTags { tags ->
            if (!tags.contains(from)) {
                null
            } else {
                CouponRules.normalizeTags(tags.map { if (it == from) to else it })
            }
        }
    }

    /** 标签删除：从所有券上摘掉它。@return 实际改动的券数 */
    suspend fun deleteTag(tag: String): Int {
        val target = CouponRules.normalizeTag(tag) ?: return 0
        return rewriteTags { tags ->
            if (!tags.contains(target)) null else tags.filter { it != target }
        }
    }

    /** 有多少张券用了这个标签（删之前拿它给用户一个数） */
    suspend fun countTagUsage(tag: String): Int {
        val target = CouponRules.normalizeTag(tag) ?: return 0
        return dao.getAllActive().count { CouponRules.normalizeTags(it.toDomain().tags).contains(target) }
    }

    /**
     * 批量改券上的标签。返回 null 表示这张不用改。
     * 属于别的账号的本地残留直接跳过，不能把上一个账号的数据改掉再推给新账号。
     */
    private suspend fun rewriteTags(transform: (List<String>) -> List<String>?): Int {
        val session = auth.currentSession()
        var changed = 0
        for (entity in dao.getAllActive()) {
            if (entity.ownerId != null && entity.ownerId != session?.userId) continue

            val coupon = entity.toDomain()
            val current = CouponRules.normalizeTags(coupon.tags)
            val next = transform(current) ?: continue
            if (next == current) continue

            val bumped = syncEngine.bumpVersion(coupon.copy(tags = next))
            dao.insert(bumped.toEntity(dirty = true, ownerId = session?.userId ?: entity.ownerId))
            changed += 1
        }
        if (changed > 0) autoSync()
        return changed
    }

    private suspend fun autoSync() {
        if (!auth.isSignedIn()) return
        if (!settingsStore.settings.sync.autoSync) return
        // 自动同步失败不打扰用户，本地的 dirty 标记还在，下拉刷新时会重试
        syncEngine.sync()
    }
}

/** 登录后是否需要弹「首次迁移」选择屏 */
data class LoginDataState(
    val localCount: Int,
    val needsChoice: Boolean,
    val switchedAccount: Boolean
)
