> ⚠️ **本文档已废弃（2026-10-26 标注）**。当前实现已推翻本文的「WebDAV 同步中枢 + 版本向量 + 字段级合并」方案，改为 **云端数据库为唯一真相源 + 乐观锁 + 离线优先**（见 [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) 与 `shared/rules/sync-protocol.md` v3）。最新架构、模块划分、任务分配与 Mermaid 图以新文档为准。

# clq-yhqgl 重构方案：安卓原生 App + 电脑网页端

> 目标：把现有 Next.js + WebDAV 单端应用，改造成「安卓原生 App + 电脑网页端」双端形态，保留 WebDAV 作为自托管同步中枢，新增本地离线存储、状态栏提醒、可插拔 AI。

---

## 一、现状梳理

### 1.1 项目定位
- **名称**：优惠券管理（WebDAV 版）
- **仓库**：https://github.com/clq12/clq-yhqgl
- **现有形态**：Next.js 16 + App Router + shadcn/ui + Tailwind CSS 的响应式 Web 应用
- **运行方式**：浏览器访问，数据存在 WebDAV（坚果云 / Nextcloud / NAS 等）

### 1.2 现有功能清单

| 模块 | 功能 | 实现位置 |
|------|------|----------|
| 优惠券 CRUD | 新增、编辑、删除、列表、单条查询 | `src/app/api/coupons/**` |
| 优惠券字段 | 标题、描述、折扣类型、折扣金额、满减门槛、开始日期、截止日期、截止时分、是否已使用、备注 | `src/lib/webdav-storage.ts` |
| 到期提醒 | 7 天 / 3 天 / 1 天分组提醒，按北京时间精确到小时 | `src/lib/utils.ts`、`src/app/api/check-expiring/route.ts` |
| 推送通道 | PushPlus 微信推送（服务端定时任务触发） | `src/lib/pushplus.ts` |
| WebDAV 配置 | 地址、用户名、密码、PushPlus Token、ChatGPT Key、52api Key | `src/lib/config.ts`、`src/components/WebDAVConfig.tsx` |
| AI 识别 | 调用智谱 GLM-4.7-flash 从文本/图片提取优惠券字段 | `src/app/api/ai/parse-coupon/route.ts` |
| OCR | tesseract.js 前端批量识别、文本识别 | `src/components/OcrCouponRecognizer.tsx`、`BatchOcrRecognizer.tsx` |
| 统计面板 | 总金额、已使用/未使用/已过期、店铺分布、排行榜 | `src/components/StatDashboard.tsx` |
| 数据存储 | WebDAV 上的 `/coupons/data.json` + `/coupons/backups/backup-*.json` | `src/lib/webdav-storage.ts` |

### 1.3 数据模型现状

现有 WebDAV 存储的 `Coupon` 结构：

```typescript
interface WebDAVCoupon {
  id: string              // UUID
  title: string           // 标题
  description: string | null
  discountAmount: number | null
  discountType: 'amount' | 'percentage' | 'full' | 'group' | null
  fullAmount: number | null
  startDate: string       // YYYY-MM-DD，北京时间日期
  endDate: string         // YYYY-MM-DD，北京时间日期
  endHour: number | null  // 0-23，默认 23
  endMinute: number | null // 0-59，默认 59
  isReminded: boolean
  remindedDays: number[]  // 已提醒过的天数 [7,3,1]
  isUsed: boolean
  notes: string | null
  createdAt: string       // ISO 字符串（无 Z，北京时间）
  updatedAt: string | null
}
```

包结构：

```json
{
  "coupons": WebDAVCoupon[],
  "lastModified": string
}
```

### 1.4 同步现状

- **当前同步模式**：单文件全量覆盖（`data.json` 整个读写）。
- **问题**：没有版本向量、没有设备标识、没有冲突解决。多设备同时写容易丢数据。
- **定时任务**：GitHub Actions / cron-job.org 每小时调 `/api/check-expiring` 推送微信。

### 1.5 AI 现状

- 仅支持智谱 GLM（模型写死 `glm-4.7-flash`）。
- 仅做「从文本提取字段」，没有对话式增删改。
- API Key 由服务端环境变量或请求参数传入，存在服务端代持风险。

### 1.6 可复用 vs 需重写

| 现有资产 | 可复用性 | 处理建议 |
|----------|----------|----------|
| WebDAV 单文件 JSON 数据结构 | 中 | 作为 v1 兼容格式，v2 增量同步需扩展元数据 |
| 优惠券字段定义 | 高 | 直接迁移到 JSON Schema，两端各自实现 |
| 到期时间计算规则（北京时间、endDate+endHour+endMinute） | 高 | 抽成独立业务规则库，Kotlin/TS 各实现一份 |
| 统计面板逻辑 | 高 | 复用算法，UI 各自实现 |
| Next.js 页面/组件 | 低 | 网页端可借鉴，但需为桌面大屏重新布局 |
| PushPlus 推送 | 中 | 网页端保留服务端推送；安卓端改为本地状态栏通知 |
| AI parse-coupon API | 中 | 逻辑可复用，但需改成可插拔模型 + 客户端直调 |
| tesseract.js OCR | 中 | 网页端继续用；安卓端改用 ML Kit / 相机 OCR |
| Cookie/LocalStorage 配置存储 | 低 | 安卓端用 EncryptedSharedPreferences / DataStore |

---

## 二、目标架构

### 2.1 总体设计

```
┌─────────────────┐      WebDAV (自托管)      ┌─────────────────┐
│   Android App   │  ◄────────────────────►  │   Desktop Web   │
│  Kotlin/Compose │      /yhqgl/v2/data.json  │  React/TypeScript│
│   Room SQLite   │      /yhqgl/v2/sync.json  │   IndexedDB     │
│ WorkManager通知 │      /yhqgl/v2/backups/   │   Service Worker │
└─────────────────┘                           └─────────────────┘
         │                                              │
         └──────────── 同一套 JSON Schema / 业务规则 ────┘
```

### 2.2 技术栈

| 端 | 技术 | 说明 |
|----|------|------|
| 安卓原生 | Kotlin + Jetpack Compose | 官方推荐，声明式 UI |
| 安卓本地存储 | Room + SQLite | 离线-first |
| 安卓后台提醒 | WorkManager + NotificationManager | 精确/近似闹钟 |
| 安卓网络 | OkHttp + WebDAV 方法 | 自实现轻量 WebDAV 客户端 |
| 电脑网页端 | React + TypeScript + Vite | 轻量，大屏布局 |
| 网页本地存储 | IndexedDB (idb) | 离线-first |
| 网页后台同步 | Service Worker + Background Sync / setInterval | 后台检查到期 |
| 共享协议 | JSON Schema + 版本向量 | 双端一致 |
| AI 层 | 可插拔 Provider（OpenAI 兼容接口） | 默认 Agnes，支持智谱/DeepSeek 等 |

### 2.3 数据模型 v2（JSON Schema 为唯一真相源）

核心实体：

- `Coupon`：优惠券，与现有字段基本保持一致，增加 `version`、`deviceId`。
- `SyncCheckpoint`：同步元数据，包含 `vectorClock`、`lastSyncAt`、`deviceId`、`schemaVersion`。
- `AppSettings`：应用设置，WebDAV 配置、AI Provider 配置、提醒设置等。
- `ChangeLog`（可选）：本地变更日志，用于增量同步与冲突审计。

文件布局（WebDAV）：

```
/yhqgl/v2/
  data.json           # 合并后的全量数据（兼容读取）
  sync.json           # 同步元数据 + 各设备向量时钟
  backups/
    data-YYYYMMDD-HHmmss.json
  devices/
    {deviceId}.json   # 各设备最近一次上传的快照（可选，用于快速增量）
```

---

## 三、分阶段实施步骤

### Phase 0：基础设施与共享契约（本阶段优先做）

1. 建立 `shared/schemas/` 目录，用 JSON Schema 定义 `Coupon`、`SyncCheckpoint`、`AppSettings`。
2. 建立 `shared/rules/` 目录，用伪代码/文档描述业务规则：
   - 到期时间计算
   - 提醒触发条件
   - 冲突合并策略
3. 生成/手写 Kotlin 与 TypeScript 类型文件。
4. 设计 WebDAV 增量同步协议（见后文）。

### Phase 1：安卓原生 App

1. 创建 Android 项目（Gradle + Kotlin DSL）。
2. 本地存储：Room 实体、DAO、Database。
3. 业务层：Repository、UseCase（CRUD、筛选、统计）。
4. UI 层：Jetpack Compose 页面（列表、表单、详情、统计、设置）。
5. WebDAV 客户端：基于 OkHttp 实现 PROPFIND/GET/PUT/MKCOL。
6. 同步引擎：下载 → 三向合并 → 上传 → 写本地。
7. 提醒：WorkManager 每小时检查，状态栏通知，点击跳转详情。
8. AI 接入层：可插拔 Provider，对话意图解析（创建/编辑/删除），变更预览确认。

### Phase 2：电脑网页端

1. 创建 Vite + React + TypeScript 项目。
2. 本地存储：IndexedDB 封装（idb）。
3. 业务层：与安卓共用规则函数（TS 版）。
4. UI 层：大屏布局（左侧列表、右侧详情/统计、顶部工具栏）。
5. WebDAV 同步引擎：浏览器端直接调用 WebDAV（CORS 需配置）。
6. 后台提醒：Service Worker + 浏览器通知（可选，因为网页端有安卓通知兜底）。
7. AI 接入层：与安卓共用 Provider 接口，默认 Agnes。

### Phase 3：冲突处理与同步优化

1. 实现版本向量冲突检测。
2. 实现字段级合并策略。
3. 支持离线编辑队列（本地先改，联网后同步）。
4. 增加同步状态可视化（最后同步时间、冲突数量）。
5. 自动化测试：双端并发写模拟。

### Phase 4：AI 增强与细节打磨

1. 默认 Agnes Provider 接入。
2. 自然语言命令：「帮我添加一张瑞幸 5 折券，10 月 30 日到期」。
3. 变更预览卡片：AI 拟定的增删改必须用户确认才执行。
4. 失败重试、网络异常提示。
5. OCR 接入：安卓 ML Kit，网页保留 tesseract.js。

---

## 四、WebDAV 同步协议设计

### 4.1 核心问题

- 单文件全量覆盖无法处理并发写。
- 需要识别「哪个设备最后改了哪条数据」。
- 需要支持离线编辑后合并。

### 4.2 推荐方案：版本向量 + 最后写入者 wins（字段级）

每设备一个单调递增的计数器，构成向量时钟：

```json
{
  "deviceId": "android-abc123",
  "vectorClock": {
    "android-abc123": 5,
    "web-desktop-xyz": 3
  },
  "lastSyncAt": "2026-10-20T13:16:37+08:00"
}
```

每条 `Coupon` 也带 `version: { deviceId: string, counter: number }` 和 `modifiedAt`。

同步流程：

1. 读取远程 `data.json` 与 `sync.json`。
2. 读取本地数据库。
3. 对每条优惠券：
   - 本地无、远程有 → 拉取。
   - 本地有、远程无 → 若本地未删除则上传；若本地已软删且远程版本旧，则上传删除。
   - 本地和远程都有 → 比较向量时钟。
     - 一方严格大于另一方 → 取大者。
     - 并发冲突（不可比较）→ 字段级合并，冲突字段取 `modifiedAt` 最新；若时间相同，按 deviceId 字典序稳定取一方。
4. 合并后写本地，再上传新的 `data.json` 和 `sync.json`。
5. 上传前用 ETag 或 HEAD 检查远程文件是否被其他设备修改；若已修改，则重新读取并合并（乐观锁）。

### 4.3 与现有 v1 数据兼容

- 首次同步时，读取旧 `/coupons/data.json`，给所有记录生成初始 `version`（deviceId=当前设备，counter=1）。
- 写回新路径 `/yhqgl/v2/data.json`，旧路径保留为只读备份。

### 4.4 更轻量的替代方案对比

| 方案 | 优点 | 缺点 | 是否推荐 |
|------|------|------|----------|
| **WebDAV 单文件 JSON**（现状） | 零部署、任意网盘可用 | 无并发控制、易冲突 | 不推荐作为最终方案 |
| **WebDAV + 版本向量**（推荐） | 仍零部署、解决并发、可离线 | 需要客户端实现合并逻辑 | **推荐** |
| **Syncthing** | 点对点同步、自动冲突文件 | 需要设备同时在线、不能选目录精细同步 | 可作为个人备选 |
| **自架后端（Supabase/Cloud Service）** | 实时同步、权限控制 | 需要服务器/云厂商、不完全自托管 | 不推荐，违背自托管诉求 |
| **Git 仓库** | 版本控制、冲突可见 | 操作重、不适合手机端、需要 Git 工具 | 不推荐 |

结论：**保留 WebDAV，升级为版本向量协议**是成本最低、最符合「轻量、便携、易自托管」的方案。

---

## 五、AI 板块设计

### 5.1 可插拔模型接入层

统一接口（TypeScript 示意）：

```typescript
interface LlmProvider {
  name: string;
  chat(messages: ChatMessage[], options?: LlmOptions): Promise<string>;
  parseCoupon?(text: string): Promise<Partial<Coupon>>;
}
```

默认 Provider：`AgnesProvider`（兼容 OpenAI 接口）。
预留 Provider：`ZhipuProvider`、`DeepSeekProvider`、`OpenAIProvider`。

### 5.2 自然语言命令解析

AI 输出结构化 JSON：

```json
{
  "intent": "create" | "update" | "delete" | "query" | "chat",
  "targetId": "uuid-or-null",
  "changes": { "title": "...", "endDate": "2026-10-30", ... },
  "filters": { "store": "瑞幸", "expiringInDays": 7 },
  "reasoning": "用户想添加一张瑞幸 5 折券..."
}
```

### 5.3 变更预览与确认

- UI 弹出「AI 拟执行以下操作」卡片，展示增/删/改差异。
- 用户点击「确认」才写入本地数据库。
- 请求失败（网络/模型异常）时显示重试/取消按钮，不静默失败。

---

## 六、风险与注意事项

1. **WebDAV CORS**：网页端直接访问 WebDAV 需要目标服务支持 CORS；坚果云 WebDAV 默认不支持跨域，网页端可能需要配置反向代理或使用服务端中转。安卓原生无此问题。
2. **时区一致性**：所有日期时间继续按北京时间（UTC+8）处理，与现有逻辑保持一致。
3. **数据迁移**：旧 `/coupons/data.json` 需要一次性迁移到 `/yhqgl/v2/`。
4. **Android 通知权限**：Android 13+ 需要运行时申请 `POST_NOTIFICATIONS`。
5. **后台限制**：国产 ROM 可能杀死 WorkManager，需引导用户设置电池白名单。
6. **AI Key 安全**：Key 只存在本地加密存储（Android EncryptedSharedPreferences / Web IndexedDB），不经过任何服务端。

---

## 七、下一步动作

1. 在 `shared/schemas/` 落地 JSON Schema。
2. 在 `android/` 初始化 Kotlin 项目骨架并创建 Room 实体。
3. 在 `web/` 初始化 Vite+React 项目并创建 IndexedDB 封装。
4. 实现跨端共用的业务规则函数（Kotlin + TS）。
5. 实现 WebDAV 同步引擎核心逻辑。
