# clq-yhqgl 重构项目

本仓库是 [clq-yhqgl](https://github.com/clq12/clq-yhqgl) 的双端重构工程：

- `android/`：安卓原生 App（Kotlin + Jetpack Compose + Room + WorkManager）
- `web/`：电脑网页端（React + TypeScript + Vite + WorkBuddy 云服务）
- `shared/`：双端共享的数据模型、JSON Schema、业务规则、同步协议
- `docs/`：重构分析与实施计划

## 核心设计

- **双存储**：网页端使用 WorkBuddy 云数据库（按用户隔离，跨设备同步），本地 IndexedDB 作为离线缓存；安卓端 Room + WebDAV 自托管同步。
- **离线优先**：本地先写后同步，网络异常时自动回退本地缓存。
- **版本向量同步**：解决多端并发写冲突，支持字段级合并。
- **状态栏提醒**：安卓 WorkManager + Notification；网页 Service Worker + 浏览器通知。
- **可插拔 AI**：默认 Agnes，预留其他 OpenAI 兼容 Provider。

## 在线使用

- **网页端**：https://clq-yhqgl-web.app.workbuddy.host/?sharecode=EHMXXINRSS
  - 首次使用需邮箱验证码登录；登录后数据保存在云端，换设备可直接访问。
- **安卓 APK**：[v2.0.5 Release](https://github.com/clq12/clq-yhqgl/releases/download/v2.0.5/app-release-unsigned.apk)
  - 推送 `v*.*.*` 标签后 GitHub Actions 自动构建并上传 APK。

## 云服务（网页端）

网页端已接入 WorkBuddy 云服务：

| 模块 | 状态 |
|---|---|
| 数据库 | `coupons`、`settings` 两张表，RLS 按 `owner_id = auth.uid()` 隔离 |
| 认证 | 邮箱验证码登录/注册（`cloud.auth.sendOtp` + `verifyOtp`） |
| 登录同步 | 登录后自动拉取该账号的云端数据；首次登录会把本地历史数据补传上云 |
| 离线降级 | 云端写入失败时自动写本地 IndexedDB，不影响操作 |

数据库结构：

- `coupons`：优惠券主表（id/title/discount_type/start_date/end_date/reminder/version 等）
- `settings`：用户设置（WebDAV/AI/提醒配置，JSONB 存储）

### 登录后的账号数据同步

`web/src/db/appDb.ts` 的 `syncAccountData()` 负责账号与数据库对齐：

1. 读取当前账号在云端的全部优惠券（RLS 保证只返回自己的记录）。
2. 与本地 IndexedDB 缓存合并：
   - 云端没有、本地有 → 视为该账号的历史数据，补传上云；
   - 两端都有 → 取修改时间较新的一份；
   - 云端有、本地没有 → 直接拉取。
3. 以云端结果覆盖本地缓存，保证离线打开也有数据。
4. 记录最后登录的账号 ID；同一设备切换账号时只拉取不推送，避免把上一个账号的本地数据带到新账号。

登录流程由 `AuthContext` 驱动：`verifyOtp` 成功后立即刷新会话并触发同步，同步期间展示「正在同步账号数据」，完成后以 Toast 汇总本次拉取与补传数量。

## 快速开始

### 安卓

```bash
cd android
./gradlew assembleDebug
```

发布 release 时推送标签即可自动打包 APK：

```bash
git tag v2.0.6
git push origin v2.0.6
```

### 网页

```bash
cd web
npm install
npm run dev
```

构建产物：

```bash
npm run build   # 输出到 web/dist
```

## 文档

- [重构分析与分阶段计划](./docs/REFACTOR_ANALYSIS.md)
- [优惠券业务规则](./shared/rules/coupon-rules.md)
- [WebDAV 同步协议](./shared/rules/sync-protocol.md)
