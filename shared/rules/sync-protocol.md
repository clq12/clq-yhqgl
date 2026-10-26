# 数据一致性协议（v3，2026-10-21 定稿）

> 这份文档描述的是**当前实现**。上一版（WebDAV 三向合并 + 字段级合并）已废弃，
> 保留在文末「历史方案」一节仅供参考。

## 1. 真相源

**云数据库是唯一真相源**，表 `coupons` / `settings`，按 `owner_id`（= `auth.uid()`）做 RLS 隔离。

- 网页端：已登录直接读写云库；未登录回退 IndexedDB（纯本地）。
- 安卓端：本地 Room 作为缓存 + 离线写缓冲，登录后与云库对齐。
- **WebDAV 不是同步通道**，只是安卓端/网页端手动点的「备份 / 恢复」两个动作。

两端都不需要自建后端：安卓直连云服务的 REST 接口，语义是标准 PostgREST。

## 2. 接口事实（已实测）

| 用途 | 方法与路径 |
|------|-----------|
| 鉴权头 | `x-wb-webapp-access-key: <publishableKey>`（不是 `apikey`） |
| 用户态 | `Authorization: Bearer <access_token>` |
| 发码 | `POST /.cloud/auth/v1/verification` `{email, usage:"email"}` → `{verification_id, is_user}` |
| 验码 | `POST /.cloud/auth/v1/verification/verify` `{verification_id, verification_code}` → `{verification_token}` |
| 登录 | `POST /.cloud/auth/v1/signin` `{username, verification_token}` |
| 注册 | `POST /.cloud/auth/v1/signup` `{email, password, verification_token}` |
| 续期 | `POST /.cloud/auth/v1/token` `{grant_type:"refresh_token", refresh_token}` |
| 数据面 | `{endpoint}/.cloud/database/rest/<table>`，`select=` / `id=eq.x` 等 PostgREST 参数 |

## 3. 字段约定

`coupons` 表关键列：

| 列 | 说明 |
|----|------|
| `deleted_at` | 软删除时间戳。**非 null 即已删除**，删除状态只认这一个字段 |
| `modified_at` | 最后修改时间，乐观锁的比较依据 |
| `version` | `{deviceId, counter}`，记录是哪台设备第几次改的 |
| `is_reminded` / `reminded_days` | **不参与同步**，只作云端历史值；提醒状态以各设备本地为准 |

领域模型里 `deletedAt` 是唯一真相，`isDeleted` 只是它的派生（`deletedAt != null`）。

`settings.ai.apiKey` 与 `aiAssistants[].apiKey` 是**用户自持密钥**：两端写云前都会剥掉
（网页端 `appDb.stripSecrets`），云端这两处恒为 `null`，读回时再用本机缓存补上。
也就是说「换台设备要重新填 Key」是设计使然，不是丢配置。

`sync.json`（即 `BackupMetadata`）在 v3 下**仅作手动备份元数据**（`lastBackupAt` / `lastBackupPath`），
不再包含任何向量时钟或同步/冲突语义——v2 的 `vectorClock` 已移除。

## 4. 写路径

```
用户操作 → 写本地（dirty = true） → 若已登录且开启自动同步 → CloudSyncEngine.sync()
```

- 未登录（游客模式）：只写本地，`ownerId` 保持 null。
- 已登录：`ownerId` 盖上当前账号。

## 5. 同步流程（先推后拉）

1. 拉取云端全量（包含墓碑）。
2. 遍历本地 `dirty = true` 的记录：
   - 属于别的账号 → 跳过，绝不上传。
   - `deletedAt != null` → 调软删除；若云端 `modified_at` 更新则标记冲突。
   - 云端不存在 → `insert`。
   - 云端 `modified_at` **更新** → 标记 `conflict = 1`，不覆盖（乐观锁）。
   - 否则 → `update`。
3. 拉取云端有、本地没有的记录；本地干净且非冲突的，以云端为准（保留本地提醒状态）。
4. 清掉已同步的墓碑（`deletedAt != null AND dirty = 0`）。

## 6. 冲突语义

**不做字段级合并，不做历史快照。** 冲突的处理方式只有一个：拦下并让用户看到。

- 本地写入被拦 → 该条 `conflict = 1`、`dirty = 0`，在「待解决」列表里高亮。
- 用户处理方式：以云端为准（放弃本地改动）或重新编辑覆盖（`modified_at` 推到当前时刻）。
- **网页端**：命中的两边都存进 localStorage 的「待解决」清单（`web/src/sync/conflicts.ts`），
  设置页顶部逐条给出「字段级差异 + 两个按钮」，不处理就一直留着。
  覆盖时走 `resolveConflictKeepLocal`，时间戳取 `now + 1ms`，否则下一轮同步会再次判冲突。
- **安卓端**：`ConflictScreen` + `dao.markConflict(id)`，语义一致。
- 判定函数只有一份：`web/src/sync/decideWrite.ts`，`scripts/concurrency-check.mjs` 直接拿它做回归。

## 7. 账号与游客

| 场景 | 处理 |
|------|------|
| 退出登录 | 降级为游客本地模式，数据留本机，功能照常 |
| 首次登录（本机有数据、从未登录过） | 弹一屏让用户选：上传本地 / 只拉云端 / 先清空再拉 |
| 同账号再次登录 | 自动上传，不打扰 |
| 换账号登录 | 先清掉属于上一个账号的本地残留（`owner_id` 不匹配），再按用户选择处理 |

「同账号才认领」：游客数据（`ownerId = null`）可被任一账号认领，但属于账号 A 的记录
在 B 登录时会被直接清掉，不会串号。

## 8. 提醒

- 按设备各自提醒。`ReminderWorker` / 网页 `sw.js` 只写本地 `isReminded` / `remindedDays`，不置 `dirty`。
- 因此电脑上提醒过，不会让手机静默。
- **静默时段**（`reminder.quietStart` / `quietEnd`，`HH:mm`，支持跨零点）双端同一套判定：
  命中就整轮跳过，**且不标记已提醒** —— 标记了等于把这张券永久吞掉，安静结束后就不会再补。
  格式非法或起止相同一律当作「没配」，不要因为脏数据把提醒停掉。

## 9. WebDAV 备份（手动，仅元数据）

```
{rootPath}/               # 默认 /yhqgl/v2
  data.json               # 最近一次备份（全量）
  backups/backup-{ts}.json # 带时间戳的历史快照，可回滚
```

- WebDAV **不是同步通道**，只是可选的「一键手动备份」出口。备份仅写本地数据的快照，
  **不读回、不合并**，避免与云端真相源产生歧义。
- 备份元数据（`sync.json` / `BackupMetadata`）只记录 `lastBackupAt` / `lastBackupPath` 等，
  **不含任何同步 / 冲突语义**；v3 已移除 v2 的向量时钟（`vectorClock`）。
- **备份**：从本地/云端拉最新数据写一份快照（含时间戳），不覆盖历史。
- **恢复**：读 `data.json`（或 `backups/` 里最新一份），**覆盖**本地（已登录时同步云端）
  —— 云端有、备份里没有的券会被软删除。
- 不做自动备份，不做双向合并。**未配置 WebDAV 完全不影响云同步。**

## 10. 规则防漂移

业务规则（截止时间、剩余天数、状态标签、优惠文案、店铺识别）在 TS 与 Kotlin 各有一份实现，
由 `scripts/contract-check.mjs` 强制对齐：

- 店铺名单必须与 `shared/data/stores.json` 逐项一致。
- `shared/data/contract-cases.json` 的固定用例，在固定「当前时间」下，
  TS 端算出 `shared/data/contract-expected.json`，Android 单测用 Kotlin 实现重算，必须完全相同。

并发写另有独立回归：`node --experimental-strip-types scripts/concurrency-check.mjs`
（双设备回合、覆盖后不复发、软删除不复活、提醒字段不被云端覆盖）。

已知必修的坑：`remainingHours` / `remainingDays` 必须用**地板除法**
（JS `Math.floor`、Kotlin `Math.floorDiv`）。用截断除法时，已过期的券两端会差一天。

## 11. 历史方案（已废弃）

v2 的 WebDAV 三向合并：`data.json` + `sync.json`，向量时钟判断因果关系，
并发时逐字段取 `modifiedAt` 较新者。问题在于两端各写各的，网页端根本没有参与这套协议，
实际结果是两份互不可见的数据。v3 直接砍掉了这层抽象。
