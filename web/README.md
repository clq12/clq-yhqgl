# 电脑网页端（web）

React + TypeScript + Vite 的网页端。数据同步走 **WorkBuddy 云数据库**，WebDAV 只做「手动备份 / 恢复」。

## 技术栈

- React + TypeScript + Vite
- Tailwind CSS
- IndexedDB（`idb` 封装）作本地缓存 / 游客模式存储
- `@tencent-ai/workbuddy-cloud-sdk`（云数据库 + 邮箱验证码登录）
- Service Worker（后台到期检查与浏览器通知）

## 模块结构

```
web/src/
├── main.tsx              # 入口
├── App.tsx               # 路由与整体布局
├── cloud.ts              # 云端 SDK 初始化（publishableKey + endpoint）
├── database.types.ts     # 云端表结构类型
├── context/AuthContext   # 登录态、同步状态、首次登录迁移三选
├── db/
│   ├── appDb.ts          # 统一数据层：已登录走云、未登录走 IndexedDB；乐观锁 + 软删除
│   └── indexedDB.ts      # 本地库（coupons / settings）
├── sync/
│   ├── decideWrite.ts    # 乐观锁判定（纯函数，scripts/concurrency-check.mjs 直接测它）
│   ├── conflicts.ts      # 「待解决」冲突清单（localStorage）
│   ├── backup.ts         # WebDAV 手动备份 / 恢复
│   └── webdav.ts         # 轻量 WebDAV 客户端（仅手动备份用）
├── ai/                   # 可插拔 AI Provider（文本 + 识图）
├── rules/、types/        # 转发 shared/ 下的共享实现，不留第二份拷贝
├── hooks/、lib/          # 数据变更广播、列表数据源等
└── components/           # 页面组件（列表 / 详情 / 表单 / 设置 / 冲突面板 / 迁移弹窗）
```

## 本地开发

```bash
cd web
npm install
npm run dev      # 开发预览；加 ?demo=1 用本地示例数据，跳过云端登录
npm run build    # tsc 类型检查 + vite 构建，产物在 web/dist
npm run lint
```

## 几条不能踩的约定

- **AI Key 不上云**：`appDb.putSettings` 写云前会走 `stripSecrets()`，把 `ai.apiKey`
  与每个助手的 key 置空；读回时用本机缓存补回。换设备要重新填 Key 是预期行为。
- **冲突不自动合并**：`putCoupon` 命中乐观锁会登记进「待解决」，由用户在设置页裁决；
  覆盖时 `modified_at` 必须推到 `now + 1ms`，否则下一轮同步会再次冲突。
- **提醒状态仅本地**：`isReminded` / `remindedDays` 不参与同步，`sw.js` 只写本机；
  静默时段命中时跳过但**不标记**，安静结束后补弹。
- **软删除的唯一真相是 `deletedAt`**，不要再引第二个布尔字段。

更多见 [根 README](../README.md)、[架构文档](../docs/ARCHITECTURE.md)、
[数据一致性协议](../shared/rules/sync-protocol.md)。
