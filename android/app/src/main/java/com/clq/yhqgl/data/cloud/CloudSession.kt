package com.clq.yhqgl.data.cloud

/**
 * 云账号会话。
 *
 * [userId] 对应服务端的 sub，也就是 RLS 里的 auth.uid()。
 * 游客模式（未登录）下为 null。
 */
data class CloudSession(
    val accessToken: String,
    val refreshToken: String?,
    /** 毫秒时间戳；未知时为 0，表示"用过再说" */
    val expiresAt: Long,
    val userId: String,
    val email: String?,
    val name: String?
) {
    fun isExpired(now: Long = System.currentTimeMillis()): Boolean =
        expiresAt > 0 && now >= expiresAt - 60_000
}

/** 发码结果：verification_id 用来换 token，isUser 决定走登录还是注册 */
data class OtpChallenge(val verificationId: String, val isUser: Boolean)
