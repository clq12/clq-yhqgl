package com.clq.yhqgl.data.cloud

/**
 * 云服务连接参数。
 *
 * 这些值来自 workbuddy_cloud_service 的 publicConfig，属于可公开嵌入客户端的凭据，
 * 真正的隔离由服务端 RLS（owner_id = auth.uid()）保证。
 *
 * 安卓直连同一套 REST 接口，不需要自建后端：
 * - 数据面：POST/GET {REST_BASE}/<table>，标准 PostgREST 语义
 * - 鉴权头：x-wb-webapp-access-key（注意不是 apikey）
 * - 用户态：Authorization: Bearer <access_token>
 */
object CloudConfig {
    const val ENDPOINT = "https://clq-yhqgl-web.app.workbuddy.host"
    const val PUBLISHABLE_KEY = "wbpk_4KwD8V477FzbwZVOPdaE9O_zZKtcJbzML1sHHCmVmChuWXYdyOTrZCH"
    const val ACCESS_KEY_HEADER = "x-wb-webapp-access-key"

    const val AUTH_BASE = "$ENDPOINT/.cloud/auth"
    const val REST_BASE = "$ENDPOINT/.cloud/database/rest"

    // 登录链（与网页端完全一致）
    const val PATH_VERIFICATION = "$AUTH_BASE/v1/verification"
    const val PATH_VERIFICATION_VERIFY = "$AUTH_BASE/v1/verification/verify"
    const val PATH_SIGNIN = "$AUTH_BASE/v1/signin"
    const val PATH_SIGNUP = "$AUTH_BASE/v1/signup"
    const val PATH_TOKEN = "$AUTH_BASE/v1/token"
    const val PATH_SIGNOUT = "$AUTH_BASE/v1/user/signout"

    const val TABLE_COUPONS = "coupons"
    const val TABLE_SETTINGS = "settings"
}
