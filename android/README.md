# Android 原生端（android）

Kotlin + Jetpack Compose。本地 Room 作离线缓存与写缓冲，登录后与 **WorkBuddy 云数据库**对齐；
WebDAV 只用于「手动备份 / 恢复」。

## 技术栈

- Kotlin + Jetpack Compose（单 Activity）
- Room + SQLite（本地缓存、`dirty` 写标记、`conflict` 冲突标记）
- OkHttp（云 REST 接口 + WebDAV 备份）
- WorkManager（每小时到期提醒）
- kotlinx.serialization（JSON）
- **手写依赖注入** `di/ServiceLocator.kt`（没有用 Hilt）
- `EncryptedSharedPreferences`（AI Key 等本地设置，Keystore AES256-GCM）

## 模块结构

```
app/src/main/java/com/clq/yhqgl/
├── YhqApplication.kt          # Application 入口（注册 ReminderWorker）
├── MainActivity.kt            # 单 Activity
├── data/
│   ├── local/                 # Room：AppDatabase / CouponEntity / CouponDao
│   ├── cloud/                 # CloudAuth（验证码三步链）、CouponCloudApi（PostgREST）
│   ├── sync/                  # CloudSyncEngine（权威同步）、BackupEngine + WebDAVClient（备份）
│   ├── repository/            # CouponRepository（写本地 → 打 dirty → autoSync）
│   ├── ai/                    # AIProvider / AgnesProvider / AiAssistants
│   └── settings/              # SettingsStore（加密存储）
├── di/ServiceLocator.kt       # 会话、仓库、同步状态的单例装配
├── ui/                        # Compose 页面（列表/表单/详情/统计/设置/冲突/AI）
└── worker/ReminderWorker.kt   # 每小时巡检 + 通知
```

领域模型与业务规则不在这里复制：`app/build.gradle.kts` 用
`sourceSets["main"].java.srcDir("../../shared/types/kotlin")` 直接编译 `shared/` 的源码。

## 同步

- 写入路径：`CouponRepository` 先落 Room 并置 `dirty`，随后 `autoSync()`
  （受设置项 `sync.autoSync` 控制）。
- 核心：`CloudSyncEngine.sync()` —— 先推后拉，写前比 `modified_at`，
  云端更新则 `dao.markConflict(id)` 并计入 `conflicts`，绝不静默覆盖。
- 云端有、本地没有的会被拉下来；本地干净且非冲突的以云端为准，
  **但保留本机 `isReminded` / `remindedDays`**（提醒按设备各算）。
- 首次登录的三选（上传本地 / 只拉云端 / 先清空再拉）在 `LoginScreen` 里。

## 提醒

- `ReminderWorker` 每小时跑一次，按 `remindedDays` 档位去重，只写本地、不置 `dirty`。
- 静默时段（`quietStart` / `quietEnd`，支持跨零点）命中则**整轮跳过且不标记**，
  安静结束后补弹。
- Android 13+ 必须申请 `POST_NOTIFICATIONS`，否则通知被系统静默丢弃。

## AI

- `AIDialog`：自然语言下达指令（`AIProvider.parseIntent`）+ 图片识别添加
  （`AgnesProvider.recognizeImage`，图片先压缩再转 data URL）。
- 多助手在设置页管理，识图只用勾了「支持图片」的助手；Key 只存在本机加密存储里。

## 构建与测试

```bash
cd android
./gradlew assembleDebug
./gradlew :app:testDebugUnitTest     # 含 CouponRulesContractTest（读 shared/data 的 fixture）
```

发布：推 `v*.*.*` 标签触发 `.github/workflows/android-release.yml`，自动出签名 APK。
路径含中文时需 `android.overridePathCheck=true`，详见根 README。

更多见 [根 README](../README.md)、[架构文档](../docs/ARCHITECTURE.md)、
[风险与运维手册](../docs/OPERATIONS.md)。
