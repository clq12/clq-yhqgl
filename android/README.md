# Android 原生端

## 技术栈

- Kotlin + Jetpack Compose
- Room + SQLite（本地离线存储）
- OkHttp（WebDAV 客户端）
- WorkManager（后台到期提醒）
- Kotlinx Serialization（JSON）
- Hilt（依赖注入，可选）

## 模块结构

```
app/src/main/java/com/clq/yhqgl/
├── YhqApplication.kt          # Application 入口
├── MainActivity.kt            # 单 Activity
├── data/
│   ├── local/                 # Room 数据库、Entity、DAO
│   ├── model/                 # 领域模型（与 shared/schemas 一致）
│   ├── repository/            # CouponRepository
│   ├── sync/                  # WebDAV 客户端 + 同步引擎
│   ├── ai/                    # 可插拔 AI Provider
│   └── settings/              # DataStore 设置
├── ui/                        # Compose 页面与 ViewModel
└── worker/                    # WorkManager 提醒任务
```

## 同步入口

- 手动同步：设置页 / 列表下拉刷新
- 自动同步：WorkManager 每 15 分钟触发一次（可配置）
- 入口：`CouponRepository.sync()` -> `SyncEngine.sync()`

## 提醒入口

- `ReminderWorker` 每小时运行一次，检查到期优惠券。
- 触发时发送 Notification，点击打开对应详情页。
- Android 13+ 需申请 `POST_NOTIFICATIONS`。

## AI 入口

- `AIPanel` 对话框输入自然语言。
- `AIProvider.parseIntent()` 解析意图。
- UI 展示变更预览，确认后写入 Repository。
