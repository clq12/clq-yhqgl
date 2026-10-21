# clq-yhqgl 重构项目

本仓库是 [clq-yhqgl](https://github.com/clq12/clq-yhqgl) 的双端重构工程：

- `android/`：安卓原生 App（Kotlin + Jetpack Compose + Room + WorkManager）
- `web/`：电脑网页端（React + TypeScript + Vite + WorkBuddy 云服务）
- `shared/`：双端共享的数据模型、JSON Schema、业务规则、契约用例
- `scripts/`：契约检查与仓库工具

## 核心设计

- **云数据库是唯一真相源**。表 `coupons` / `settings`，RLS 按 `owner_id = auth.uid()` 隔离。
  网页端与安卓端登录同一个邮箱账号，看到的是同一份数据。
- **安卓直连云 API，不需要自建后端**：`x-wb-webapp-access-key` + `Bearer` token，
  数据面是标准 PostgREST，登录走邮箱验证码三步链。
- **本地离线优先**：所有写操作先落本地（Room / IndexedDB）并打 `dirty` 标记，联网后补传。
- **乐观锁代替合并**：写前比较云端 `modified_at`，云端更新则整条拦下并提示，不做字段级合并。
- **软删除**：`deleted_at` 非空即已删除，两端都不会把已删除的数据「复活」。
- **WebDAV 只是备份**：安卓设置页两个手动按钮（备份 / 恢复），不参与同步、不自动跑。
- **提醒按设备各算**：提醒状态只存本地，电脑上提醒过不会让手机静默。

## 在线使用

- **网页端**：https://clq-yhqgl-web.app.workbuddy.host/?sharecode=EHMXXINRSS
  - 首次使用需邮箱验证码登录；登录后数据存在云端，换设备直接可用。
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
6. 首次登录若本机有数据 → 弹一屏让用户选「上传本地 / 只拉云端 / 先清空再拉」。

### 标签

标签是自由文本数组（`tags`），用来按平台/场景归类：抖音、拼多多、淘宝、美团… 与「店铺识别」
（从标题猜店铺）是两件事——标签是用户自己打的，可以多个、可以自定义。

录入时自动复用，分三层：

1. **历史高频**：统计已有券用过的标签，按频次降序排在最前面，点一下即可加上；
2. **常用标签补位**：历史不够时用 `shared/data/tags.json` 的默认名单补齐；
3. **标题识别**：标题里出现平台名时给一个「+ 抖音」的一键添加按钮，但**不自动加**。

两端都支持按标签筛选（网页左侧标签条、安卓列表标签行），搜索也会命中标签。

### 规则防漂移

业务规则在 TS 与 Kotlin 各有一份实现（`shared/types/typescript/couponRules.*`、
`shared/types/kotlin/CouponRules.kt`），靠契约测试强制对齐：

```bash
node --experimental-strip-types scripts/contract-check.mjs          # 校验
node --experimental-strip-types scripts/contract-check.mjs --write  # 规则改动后重新生成期望值
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

- [数据一致性协议](./shared/rules/sync-protocol.md)
- [优惠券业务规则](./shared/rules/coupon-rules.md)
- [重构分析与分阶段计划](./docs/REFACTOR_ANALYSIS.md)
