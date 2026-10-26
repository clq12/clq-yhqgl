# clq-yhqgl 重构项目

本仓库是 [clq-yhqgl](https://github.com/clq12/clq-yhqgl) 的双端重构工程：

- `android/`：安卓原生 App（Kotlin + Jetpack Compose + Room + WorkManager）
- `web/`：电脑网页端（React + TypeScript + Vite + WorkBuddy 云服务）
- `shared/`：双端共享的数据模型、JSON Schema、业务规则、契约用例
- `scripts/`：契约检查与仓库工具

> 架构以 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) 为当前唯一事实来源（v3：云端唯一真相源）。
v2 的 WebDAV 同步中枢方案已连同旧规划文档一并删除，需要回溯可看 `git log -- docs/REFACTOR_ANALYSIS.md`。

## 核心设计

- **云数据库是唯一真相源**。表 `coupons` / `settings`，RLS 按 `owner_id = auth.uid()` 隔离。
  网页端与安卓端登录同一个邮箱账号，看到的是同一份数据。
- **安卓直连云 API，不需要自建后端**：`x-wb-webapp-access-key` + `Bearer` token，
  数据面是标准 PostgREST，登录走邮箱验证码三步链。
- **本地离线优先**：所有写操作先落本地（Room / IndexedDB）并打 `dirty` 标记，联网后补传。
- **乐观锁代替合并**：写前比较云端 `modified_at`，云端更新则整条拦下并提示，不做字段级合并。
- **软删除**：`deleted_at` 非空即已删除，两端都不会把已删除的数据「复活」。
- **WebDAV 只是备份**：网页端与安卓端设置页各有两个手动按钮（备份 / 恢复），
  不参与同步、不自动跑；**未配置 WebDAV 完全不影响云同步**。
- **提醒按设备各算**：提醒状态只存本地，电脑上提醒过不会让手机静默。

## 在线使用

- **网页端**：https://clq-yhqgl-web.app.workbuddy.host/?sharecode=EHMXXINRSS
  - 首次使用需邮箱验证码登录；登录后数据存在云端，换设备直接可用。
  - 未登录时进入「游客本地模式」：数据只存本机、功能照常；首次登录若本机已有数据，
    会弹一屏让你选「上传本地 / 只拉云端 / 先清空再拉」，换账号则清掉上一个账号的本地残留、不串号。
- **安卓 APK**：[Releases](https://github.com/clq12/clq-yhqgl/releases)
  - 推送 `v*.*.*` 标签后 GitHub Actions 自动构建并上传 APK。
  - Release 包用固定 keystore 签名（材料在仓库 Secrets：`ANDROID_KEYSTORE_B64` /
    `ANDROID_STORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`），
    后续版本可直接覆盖安装升级。
  - ⚠️ Release 签名与 debug 签名不同，从 debug 包换过来必须先卸载旧版，否则报签名冲突。
  - 本地要出签名包：把 `android/keystore.properties`（已 gitignore）指到本机 keystore 即可，
    `storeFile` 相对 `android/app/` 解析。

## 云服务

| 模块 | 说明 |
|---|---|
| 数据库 | `coupons`、`settings`，RLS 按 `owner_id = auth.uid()` 隔离 |
| 认证 | 邮箱验证码（`/.cloud/auth/v1/verification` → `verify` → `signin`），两端同一条链 |
| 删除 | 软删除，`coupons.deleted_at`（2026-10-21 新增） |
| 冲突 | 乐观锁，比较 `modified_at` |

`coupons` 主要列：`id` / `owner_id` / `title` / `discount_type` / `discount_amount` /
`full_amount` / `start_date` / `end_date` / `end_hour` / `end_minute` / `is_used` / `notes` /
`created_at` / `updated_at` / `modified_at` / `version` / `deleted_at` / `tags`。

`is_reminded` / `reminded_days` 两列仍在表里，但**不参与同步** —— 提醒状态以各设备本地为准。

## 双端数据一致性

完整协议见 [shared/rules/sync-protocol.md](./shared/rules/sync-protocol.md)。要点：

1. 登录后拉取云端全量（含墓碑），本地 `dirty` 队列按账号归属过滤后推上去。
2. 写前比 `modified_at`，云端更新就拦下并把该条标为 `conflict`，进「待解决」。
3. 云端有、本地没有 → 拉下来；本地干净 → 以云端为准，但保留本机提醒状态。
4. 退出登录 → 降级「游客本地模式」，数据留本机；再登录同账号自动合并。
5. 换账号 → 先清掉属于上一个账号的本地残留（同账号才认领，不串号）。
6. 首次登录若本机有数据 → 弹一屏让用户选「上传本地 / 只拉云端 / 先清空再拉」
   （`web/src/components/MigrationDialog.tsx`；选完记住账号，之后不再打扰）。
7. 冲突不是弹个 toast 就完事：网页端把两边都存进「待解决」清单
   （`web/src/sync/conflicts.ts`），设置页顶部逐条给出字段差异 + 「以云端为准 / 用我的覆盖」。
   覆盖时 `modified_at` 推到 `now + 1ms`，否则下一轮同步会再次判成冲突。

### 到期提醒与今日待办

**判断基准**：所有日期时间按北京时间解释，截止时刻为 `endDate + endHour:endMinute:59`；
「今天到期」用 `beijingDateOf(now)` 取北京日期再比 `endDate`，不用设备本地时区
（人在国外也不会提前/滞后一天）。剩余天数用**地板除法**，已过期为负数。

**提醒策略**：

- 默认在到期前 **7 / 3 / 1 天**各提醒一次；设置里可改成 1/3/5/7/14/30 任意组合。
- 已使用的不提醒；已过期的不提醒（只出现在「已过期未使用」里等你清理）。
- 每档**只提醒一次**：`remindedDays` 记在这台设备本地，同档位不会重复弹。
- 提醒状态**不参与云端同步** —— 电脑上提醒过，手机仍会提醒（按设备各算）。
- **静默时段**（`quietStart` / `quietEnd`，支持跨零点）：命中就跳过这一轮，且不标记已提醒，
  安静结束后补弹；格式不合法按「没配」处理。两端同一套判定。

**通知渠道**（取决于平台权限，不保证每端都有）：

| 渠道 | 实现 | 前提 |
|---|---|---|
| 安卓系统通知 | `ReminderWorker`，WorkManager 每小时检查 | 系统通知权限 |
| 网页通知 | `public/sw.js`，每小时检查 + 设置页开关即时触发 | 浏览器通知权限（授权被拒则不弹） |
| App 内提醒 | 首页「今日待办」卡片 / 列表顶部四个小格子 | 无需权限 |

**今日待办**（`dueBuckets`，两端同一实现 + 契约用例）分四组，已使用的不计入任何组：

| 组 | 规则 |
|---|---|
| 今天到期 | 未过期且 `endDate == 北京今天` |
| 3 天内到期 | 未过期且剩余天数 ≤ 3 |
| 高价值待使用 | 未过期、金额 > 0，按金额降序取前 3 |
| 已过期未使用 | 已过期但没标已使用，提醒你清理 |

### 标签

标签是自由文本数组（`tags`），用来按平台/场景归类：抖音、拼多多、淘宝、美团… 与「店铺识别」
（从标题猜店铺）是两件事——标签是用户自己打的，可以多个、可以自定义。

录入时自动复用，分三层：

1. **历史高频**：统计已有券用过的标签，按频次降序排在最前面，点一下即可加上；
2. **常用标签补位**：历史不够时用 `shared/data/tags.json` 的默认名单补齐；
3. **标题识别**：标题里出现平台名时给一个「+ 抖音」的一键添加按钮，但**不自动加**。

两端都支持按标签筛选（网页左侧标签条、安卓列表标签行），搜索也会命中标签。

标签库本身在**设置 → 标签**里维护，可增删改：

- 添加：只影响录入时的推荐列表，不动已有券。
- 改名：把已有券上的旧标签一起改成新名字（与已有标签重名就合并）。
- 删除：从已有券上把这个标签摘掉，删除前会告诉你影响多少张券。
- 恢复默认：回到 `shared/data/tags.json` 的名单。

改名/删除必须连带改券，因为标签是冗余存在每张券上的，只改名单会在券上留下「幽灵标签」——
库里没有、但按标签还筛得出来。

### 规则防漂移

业务规则在 TS 与 Kotlin 各有一份实现（`shared/types/typescript/couponRules.*`、
`shared/types/kotlin/CouponRules.kt`），靠契约测试强制对齐：

```bash
node --experimental-strip-types scripts/contract-check.mjs          # 校验（含 schema↔协议）
node --experimental-strip-types scripts/contract-check.mjs --write  # 规则改动后重新生成期望值
node --experimental-strip-types scripts/concurrency-check.mjs       # 乐观锁/软删除/提醒字段回归
```

- 店铺名单必须与 `shared/data/stores.json` 逐项一致；常用标签名单必须与 `shared/data/tags.json`
  逐项、**逐序**一致（顺序就是推荐顺序）。
- `shared/data/contract-cases.json` 的固定用例在固定时刻下，两端结论必须完全相同。
- 行为用例里同时包含时间/状态/折扣文案与标签归一化、标签推荐排序。
- Android 侧对应单测：`CouponRulesContractTest`。
- 安卓工程通过 `sourceSets["main"].java.srcDir("../../shared/types/kotlin")` 直接编译共享源码，
  不再维护第二份复制件。
- CI：`.github/workflows/shared-contract.yml`。

> 已修的真实分歧：已过期券的「剩余天数」，网页端算 -1、安卓端算 0。
> 根因是 Kotlin `/` 向零截断、JS `Math.floor` 向负无穷取整；现统一为地板除法。

## 快速开始

### 安卓

```bash
cd android
./gradlew assembleDebug
```

本机若工程路径含中文，需要 `android/gradle.properties` 里的 `android.overridePathCheck=true`；
单测在中文路径下还需给 Gradle 传 `-Dorg.gradle.jvmargs="-Xmx2g -Dfile.encoding=GBK"`，
否则测试 JVM 读不了含中文的 classpath 参数文件（CI 路径是 ASCII，不受影响）。

发布 release 时推送标签即可自动打包：

```bash
git tag v2.1.0
git push origin v2.1.0
```

### 网页

```bash
cd web
npm install
npm run dev      # 开发预览；加 ?demo=1 填充示例数据
npm run build    # 输出到 web/dist
```

## 文档

- [项目架构（v3，当前事实来源）](./docs/ARCHITECTURE.md)
- [数据一致性协议](./shared/rules/sync-protocol.md)
- [优惠券业务规则](./shared/rules/coupon-rules.md)
- [v2 → v3 迁移指南](./docs/MIGRATION.md)
- [风险与运维手册](./docs/OPERATIONS.md)
