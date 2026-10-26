# clq-yhqgl 架构（v3，2026-10-26 定稿）

> 本文档是项目当前架构的**唯一事实来源**。旧方案 `docs/REFACTOR_ANALYSIS.md`（WebDAV 同步中枢 + 版本向量 + 字段级合并）已废弃，仅保留作历史参考；其提到的「版本向量 + 字段级合并」同步在实测中因网页端未参与协议、导致两份互不可见的数据，已被 v3 服务端权威模型取代。

## 1. 总体定位

以**云端数据库为唯一真相源**、双端**离线优先**、**共享业务规则层强制对齐**的优惠券管理双端应用。
同步采用「服务端权威 + 乐观锁」，WebDAV 仅作**可选手动备份**。

- 安卓原生 App：Kotlin + Jetpack Compose + Room + WorkManager + Hilt（DI）
- 电脑网页端：React + TypeScript + Vite + Tailwind + IndexedDB
- 后端：WorkBuddy 云服务（PostgREST 风格 REST + RLS 行级权限），无自建后端

## 2. 架构图

```mermaid
graph TD
    CLOUD["云端数据库（唯一真相源）<br/>coupons / settings 表<br/>RLS: owner_id = auth.uid()<br/>PostgREST REST 接口"]

    subgraph ANDROID["安卓端 (Kotlin / Compose / Room)"]
        AR["本地存储<br/>android/.../data/local (Room)"]
        AS["云同步引擎<br/>android/.../data/sync/CloudSyncEngine.kt<br/>先推后拉 · 乐观锁 · 软删除"]
        AW["提醒<br/>android/.../worker/ReminderWorker.kt<br/>仅写本地 isReminded"]
        AAI["AI 模块<br/>android/.../data/ai (AgnesProvider.kt)"]
    end

    subgraph WEB["网页端 (React / TS / Vite / IndexedDB)"]
        WR["本地存储<br/>web/src/db (IndexedDB)"]
        WS["云同步引擎<br/>web/src/db/appDb.ts（已云化）<br/>对齐安卓乐观锁"]
        WW["提醒<br/>web/src/hooks (本地调度)"]
        WAI["AI 模块<br/>web/src/ai (agnesProvider.ts)"]
    end

    WDAV["WebDAV 旁路（仅手动备份）<br/>web/src/sync/webdav.ts · android/.../data/sync/BackupEngine.kt<br/>/yhqgl/v2/data.json + backups/"]

    subgraph SHARED["共享层 shared/"]
        SS["schemas<br/>coupon.json · settings.json · sync.json"]
        ST["types<br/>kotlin/ · typescript/ (Coupon / CouponRules)"]
        SD["data<br/>stores.json · tags.json · contract-*.json"]
        SG["契约门禁<br/>scripts/contract-check.mjs<br/>+ CouponRulesContractTest.kt"]
    end

    CLOUD --> AS
    CLOUD --> WS
    AR --> AS
    AS --> CLOUD
    WR --> WS
    WS --> CLOUD
    AS --> AW
    WS --> WW
    AAI --> CLOUD
    WAI --> CLOUD
    WDAV -.手动备份/恢复.-> CLOUD
    WDAV -.手动备份/恢复.-> AR
    SS --> ST
    ST --> SD
    SD --> SG
    SG ==>|门禁: 漂移即红| SS
    SG ==>|门禁: 行为不一致即红| ST
```

## 3. 同步时序（乐观锁 + 软删除）

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant L as 本地DB<br/>(Room / IndexedDB)
    participant E as CloudSyncEngine
    participant C as 云端DB<br/>(coupons 表)

    U->>L: 写 / 改 / 删优惠券
    L-->>L: dirty = true（离线先落）
    Note over U,L: 联网且开启自动同步时触发
    U->>E: sync()
    E->>C: 拉取全量（含 deleted_at 非空的墓碑）
    C-->>E: remoteMap
    E->>L: 读取本地 dirty 队列
    L-->>E: localList(dirty = true)

    loop 遍历每条本地 dirty
        alt 软删除分支 (本地 deleted_at != null)
            E->>C: 云端是否已有该 id？
            alt 云端不存在
                E->>L: markSynced（清 dirty）
            else 云端 modified_at 更新
                E->>L: markConflict（conflict = 1, dirty = 0）
            else 否则
                E->>C: PATCH 软删除（deleted_at）
                C-->>E: 200
                E->>L: markSynced
            end
        else 普通写分支 (deleted_at == null)
            E->>C: 云端是否存在该 id？
            alt 云端不存在
                E->>C: POST insert
                C-->>E: 201
                E->>L: markSynced
            else 乐观锁：云端 modified_at 更新
                E->>L: markConflict（conflict = 1, dirty = 0，不覆盖）
            else 否则
                E->>C: PATCH update
                C-->>E: 200
                E->>L: markSynced
            end
        end
    end

    E->>C: 拉取云端有、本地无的（非墓碑）
    C-->>E: 增量
    E->>L: 插入（提醒字段用本地值，不污染）
    E->>L: purgeSyncedTombstones()（清 deleted_at 且 dirty = 0）
    E-->>U: SyncReport（pushed / pulled / conflicts / failed）
```

## 4. 冲突处理

```mermaid
flowchart TD
    W["本地写被云端拦下<br/>(云端 modified_at 更新)"] --> M["标记 conflict = 1, dirty = 0"]
    M --> L["进入「待解决」列表<br/>高亮该券"]
    L --> Q{"用户裁决"}
    Q -->|以云端为准| A["放弃本地改动<br/>用云端版本覆盖本地"]
    Q -->|重新编辑覆盖| B["modified_at 推到当前时刻<br/>forcePush 强推云端"]
    A --> E["conflict = 0, dirty = 0"]
    B --> F["conflict = 0, dirty = 0<br/>下一轮 sync 不再被判冲突"]
```

## 5. 游客 ↔ 登录切换

```mermaid
flowchart TD
    LOGOUT["退出登录"] --> GUEST["降级游客本地模式<br/>数据留本机, 功能照常<br/>ownerId 保持 null"]
    LOGIN["登录云账号"] --> FIRST{"本机已有数据<br/>且从未登录过?"}
    FIRST -->|是| POP["弹窗选择:<br/>① 上传本地 (UPLOAD)<br/>② 只拉云端 (PULL_ONLY)<br/>③ 清空再拉 (CLEAR_THEN_PULL)"]
    FIRST -->|否 同账号再登录| AUTO["自动上传认领<br/>(claimOrphans)"]
    POP --> DO["按选择执行<br/>initialMigration(mode)"]
    DO --> SYNC["sync()"]
    AUTO --> SYNC
    LOGIN2["换账号登录"] --> CLEAR["清掉上一个账号<br/>ownerId 不匹配的本地残留"]
    CLEAR --> FIRST
    SYNC --> END["同步完成, 数据对齐云端"]
```

## 6. 关键约定

- **真相源**：云端 `coupons` / `settings` 表，RLS 按 `owner_id = auth.uid()` 隔离。
- **乐观锁**：写前比 `modified_at`，云端更新则整条拦下进「待解决」，不做字段级合并。
- **软删除**：`deleted_at` 非空即删除，唯一判定。
- **离线优先**：写先落本地（Room/IndexedDB）打 `dirty`，联网后 `CloudSyncEngine` 先推后拉。
- **提醒按设备各算**：`is_reminded`/`reminded_days` 仅本地，不同步（电脑提醒过手机仍提醒是预期行为，非 bug）。
- **业务规则**：TS 与 Kotlin 各一份，由 `scripts/contract-check.mjs` + `CouponRulesContractTest` 强制对齐。
- **数值与时区**：剩余天数**地板除法**（JS `Math.floor` / Kotlin `floorDiv`）；北京时区解释所有日期（endDate+endHour:endMinute:59）。

## 7. 任务分配

模块 owner、阶段里程碑（Phase 1-5）、18 个可执行 Issue 与协作分工，见 `docs/ARCHITECTURE_REPLAN.md`（本地工作区副本；仓库未含此文件时以 `docs/ARCHITECTURE.md` 为架构总纲、`shared/rules/*` 为协议细节）。
