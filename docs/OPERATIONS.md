 # 风险与运维手册

面向排障与运维，逐项可核对。架构与协议细节见
[shared/rules/sync-protocol.md](./sync-protocol.md) 与 [docs/ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 国产 ROM 后台限制（安卓）

国产 ROM（小米 MIUI/HyperOS、华为 EMUI、OPPO ColorOS、vivo OriginOS 等）对后台应用极其激进，
会杀掉 `WorkManager` 周期任务，导致**到期提醒不弹**。

**现象**：装好 App、授权通知后，该弹的提醒没弹；打开 App 看一眼又好了。

**应对（引导用户）**：

1. 把 App 加入**电池白名单 / 不受限制 / 允许后台运行**：
   - 小米：设置 → 省电与电池 → 应用智能省电 → 本 App → 无限制。
   - 华为：设置 → 应用 → 应用启动管理 → 本 App → 手动管理（允许自启动/关联启动/后台活动）。
   - OPPO/vivo：设置 → 电池 → 自定义耗电保护 / 后台高耗电 → 允许。
2. 开启**自启动**与**允许通知**（见第 2 节）。
3. 引导文案统一放在迁移/设置页的「提醒设置」区，附各 ROM 的入口说明。

**代码侧**：`ReminderWorker` 用 `WorkManager` 的 `PeriodicWorkRequest`（每小时一次），
但仍受 ROM 管控——这是平台限制，无法 100% 保证，需在 UI 明确告知用户。
兜底：App 内「今日待办」卡片不依赖后台调度，打开即用。

## 2. Android 13+ 通知权限

Android 13（API 33）起，发送通知必须先申请 `POST_NOTIFICATIONS` 运行时权限，
否则 `ReminderWorker` 的通知会被系统静默丢弃（不报错）。

**核对**：

- `android/app/src/main/AndroidManifest.xml` 声明 `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`。
- 首次进入提醒相关页面或开关时，调用 `ActivityCompat.requestPermissions` 申请该权限。
- 若用户拒绝且选了「不再询问」，需引导去系统设置开启（提示文案 + 跳转 `Settings.ACTION_APP_NOTIFICATION_SETTINGS`）。
- 权限状态应在设置页展示（已授权 / 被拒 / 默认）。

## 3. AI Key 本地加密

AI 助手（建议标签、过期分组、识图添加）需要用户自己的 API Key（`sk`）。
**密钥只存在用户设备，绝不经服务端转发或存储**。

**两端实现**：

- **网页端**：`settings.ai.apiKey` 存于 IndexedDB（`clq-yhqgl-v2` 的 `settings` store），
  属本地域存储；若未来要进一步隔离，可迁移到 `crypto.subtle` 经用户口令派生的密钥加密后再存。
- **安卓端**：`EncryptedSharedPreferences`（基于 Android Keystore 的 `masterKey`）存储 AI Key，
  明文不出设备。

**核对**：

- 任何网络请求里，AI Key 仅作为调用第三方模型（如用户配置的 AgnesProvider）的 Bearer，
  不出现在 WorkBuddy 云同步的 `coupons` / `settings` 列里（云端的 `settings` 表不存 `ai.apiKey`）。
- 换账号 / 退出登录时，本地 AI Key 留在设备（按设备持有，符合「用户自持密钥」原则），
  但切换账号会清掉上一个账号的本地设置残留，需在 UI 提示用户 Key 是否保留。

## 4. RLS 隔离验证

云端 `coupons` / `settings` 按 `owner_id = auth.uid()` 做行级隔离。验证步骤：

1. 用账号 A 登录，记录其 `auth.uid()`（可从 `cloud.auth.getSession()` 的 `user.id` 取得）。
2. 直接对 REST 接口发一条 `select=*` 到 `coupons` 表，确认只返回 `owner_id = A` 的行。
3. 用账号 B 的 token 查同一张 A 的券 `id`，确认返回为空（RLS 拦截）。
4. 尝试用 B 的 token `update` A 的券，确认被 RLS 拒绝（不应返回 200）。
5. 在 PostgREST 的 API 网关层确认 `owner_id` 由服务端从 `auth.uid()` 注入，客户端不可伪造。

**核对清单**：

- [ ] 任意用户只能读到自己的券与设置。
- [ ] 跨账号读写被 RLS 拒绝。
- [ ] `owner_id` 不在客户端可信输入里（服务端强约束）。
- [ ] 软删除记录对其它账号同样不可见。

## 5. 常见排障

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 网页通知不弹 | 浏览器通知权限被拒 / SW 未激活 | 设置页重开提醒开关触发授权；确认 `sw.js` 已注册 |
| 安卓提醒不弹 | ROM 杀后台 / 未授权通知 | 见第 1、2 节；先用 App 内「今日待办」兜底 |
| 网页改了券，手机看不到 | 未登录同账号 / 同步失败 | 确认两端同邮箱登录；设置页「重新同步」；看 `syncState` 是否 error |
| 恢复备份后数据不对 | 误用 v2 的 WebDAV data.json | 见迁移指南 §2；v3 备份只覆盖本地，需再同步云端 |
| 契约 CI 变红 | 改了规则没重跑 `--write` / 名单漂移 | 跑 `node --experimental-strip-types scripts/contract-check.mjs --write` 复核 |

## 6. 部署与回滚

- **网页端**：`web-deploy.yml` 构建 `web/dist` 并上传制品；发布走 WorkBuddy 托管域名。
- **安卓端**：`android-release.yml` 在推 `v*.*.*` 标签后自动出签名 APK 上传 Release。
- **回滚**：网页端重新部署上个制品；安卓端从 Releases 下载上一个版本覆盖安装（注意签名一致）。

## 7. 数据备份建议

- 云端是唯一真相源，但建议用户周期性做一次 **WebDAV 手动备份**（设置页「备份到 WebDAV」），
  备份写 `data.json`（latest）+ `backups/backup-{ts}.json`（历史）。
- 恢复是覆盖式：仅用于本机/本账号数据救急，恢复后会再同步云端，不跨账号串数据。
