# 本次改动说明（2026-10-29）

四项需求：① 修手机端登录；② 登录页加账号密码注册 / 登录；③ 设置里改密码（初始 123456）；
④ App 底部导航加「AI」栏（自然语言查到期、新增记录、拍照识图）。

> 结论先行：**数据库与同步协议一行没动**。改的全是认证层、两个端的登录/设置页面、
> 以及一个新的 AI 会话页。`coupons` / `settings` 表结构、RLS、乐观锁、软删除、提醒规则全部沿用。

---

## 1. 手机端无法登录

### 1.1 根因 A：`is_user` 的缺省值反了（主因）

发码接口 `POST /.cloud/auth/v1/verification` 的真实响应（本机实测，用未注册邮箱）：

```json
{ "verification_id": "eyJhbGci...", "expires_in": 600 }
```

**没有 `is_user` 字段。** 而老代码是这么写的：

```kotlin
val isUser = obj["is_user"]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() ?: true
```

缺省按「老用户」处理 → 验码后走 `/v1/signin`。但对**新账号**，上游根本不存在这个用户，
signin 必然失败，用户看到的就是「登录失败」——而这条路径正是「新手机第一次登录」的必经之路。

官方 SDK（`@tencent-ai/workbuddy-cloud-sdk`）的判定恰好相反：

```js
S({ verificationId: o, isExistingUser: i.is_user === !0 })   // 缺省 = false = 新用户
```

**修复**：改成 `is_user === true` 才算老用户；同时记录「上游有没有给过这个字段」
（`OtpChallenge.isUserKnown`），只有**没给过**且遇到 4xx 时才允许换另一条链重试一次
（网络错误 / 5xx 不重试，避免把「没网」伪装成「账号有问题」）。

### 1.2 根因 B：加密存储让 App 直接起不来

`ServiceLocator.init()` 会立刻构造 `CloudAuth` 与 `SettingsStore`，两者都在构造函数里
`EncryptedSharedPreferences.create(...)`。这套 API 依赖 Android Keystore，在下列场景会抛异常：

| 场景 | 为什么 |
|---|---|
| 换机 / 从备份恢复（`allowBackup="true"`） | `shared_prefs` 文件被还原，Keystore 里的主密钥留在旧设备 |
| 用户「清除数据」后再恢复 | 密文还在、密钥没了 → `AEADBadTagException` |
| 部分定制 ROM | Keystore 实现异常 |

一旦抛异常，**崩溃点在 `Application.onCreate` 之后、首屏之前**，用户的体感就是
「App 打不开」或者「点了登录就闪退」，跟「登录不了」是同一件事。

**修复**：新增 `data/cloud/SecurePrefs.kt`：

- 能用加密就用（`encrypted = true`）；
- 建不出来或读不出来 → **删掉那份坏掉的加密文件**，退到普通 `SharedPreferences`
  （`fallback_yhqgl_cloud_session`），并把 `SecurePrefs.degraded` 置位；
- 每次读写都包 `try/catch`：单条记录坏掉只当「没有」，不把异常抛进界面；
- 设置页在降级时给一行灰字提示，避免用户以为「登录态莫名其妙丢了」。

代价是降级后需要重新登录一次——比闪退划算。

### 1.3 根因 C：错误信息不可诊断

老 `readError()` 把所有非 5xx 都归成「验证码发送失败」，用户和开发者都拿不到线索。
现在：

- 服务端原始 `message` / `error_description` 会带出来；
- 常见英文错误翻成中文（`Invalid login credentials` → 「邮箱或密码不正确」等）；
- 带上 `HTTP xxx`；网络问题单独区分（`-1` 不可用 / `-2` 超时）；
- `CloudException` 增加 `httpCode`，让「业务拒绝」和「网络失败」在代码里可区分。

### 1.4 涉及文件

| 文件 | 改动 |
|---|---|
| `android/.../data/cloud/SecurePrefs.kt` | **新增**：加密存储 + 降级兜底 |
| `android/.../data/cloud/CloudAuth.kt` | 重写：`is_user` 语义、双链登录、改密、错误翻译、改用 `SecurePrefs` |
| `android/.../data/cloud/CloudSession.kt` | `OtpChallenge` 增加 `isUserKnown` |
| `android/.../data/settings/SettingsStore.kt` | 改用 `SecurePrefs`（同一个崩溃点） |
| `android/.../ui/LoginScreen.kt` | 重写：三模式登录页（见 §2） |

---

## 2. 登录页新增账号密码注册 / 登录

### 2.1 页面

**安卓 `ui/LoginScreen.kt`**（整体重写，状态机由 `Step{EMAIL,CODE,MIGRATION}` 变成 `AuthScreen`）：

| 屏幕 | 内容 |
|---|---|
| `CodeEmail` / `CodeInput` | 原来的验证码登录（保留） |
| `Password` | 邮箱 + 密码 → 登录；下方「忘记密码？」「注册新账号」 |
| `RegisterForm` | 邮箱 + 密码 + 确认密码 |
| `RegisterCode` | 注册用验证码（上游要求先验码） |
| `Migration` | 首次登录迁移三选（原逻辑未动） |

顶部两个页签（`AuthTabs`）在「验证码登录 / 账号密码登录」之间切换；注册是独立入口，
因为它的表单字段和交互都不一样，塞进页签只会让两个模式互相干扰。

三条路登录成功后都走**同一个** `finishLogin()`：认领本地数据 / 清掉别的账号的残留 /
需要时弹「上传本地·只拉云端·清空再拉」。这块逻辑一行没改。

**网页 `web/src/components/LoginScreen.tsx`**：同样的三模式（`code` / `password` / `signup`），
用现成的 `Tabs` 组件切前两个。这样在手机上用密码注册的账号，电脑上也能用密码登录。

### 2.2 接口

三条链全部复用同一套端点，没有新增服务端接口：

| 场景 | 方法 / 路径 | 请求体 | 响应 |
|---|---|---|---|
| 发验证码 | `POST /v1/verification` | `{email, usage:"email"}` | `{verification_id, expires_in, is_user?}` |
| 校验验证码 | `POST /v1/verification/verify` | `{verification_id, verification_code}` | `{verification_token}` |
| 验证码登录（老用户） | `POST /v1/signin` | `{username, verification_token}` | 会话 |
| 验证码注册（新用户） | `POST /v1/signup` | `{email, password, verification_token}` | 会话 |
| **账号密码登录** | `POST /v1/signin` | `{username, password}` | 会话 |
| **账号密码注册** | `POST /v1/signup` | `{email, password, verification_token}` | 会话 |

> 注意：上游**拒绝**「只有用户名 + 密码」的注册，所以「密码注册」也必须先验一次邮箱。
> UI 上说明白了（「注册前需要验证一次邮箱」），不是 bug。

Kotlin 侧新增方法（`CloudAuth`）：

```kotlin
suspend fun signInWithPassword(email, password): Result<CloudSession>
suspend fun signUpWithPassword(email, password, verificationToken): Result<CloudSession>
```

TS 侧（`AuthContext`）：

```ts
loginWithPassword(email, password): Promise<string | null>      // null = 成功
registerWithPassword(email, password, verificationId, token): Promise<string | null>
```

返回「错误文案 or null」而不是抛异常：登录页就一个错误条，抛异常会让每个调用点重写 try/catch。

### 2.3 数据结构

- `OtpChallenge(verificationId, isUser, isUserKnown = true)` —— 新增 `isUserKnown`，
  语义是「上游是否明确给过 `is_user`」，决定允不允许 fallback 重试。
- `CouponRepository` 增加一组透传方法（`signInWithPassword` / `signUpWithPassword` /
  `changePassword` / `sendPasswordResetCode` / `resetPassword` / `usesDefaultPassword`），
  UI 不直接碰 `CloudAuth`。
- **没有新增数据库表/列**：账号体系仍由云端负责，本地只存会话。

---

## 3. 设置里改密码（初始默认 123456）

### 3.1 页面

| 端 | 文件 | 入口 |
|---|---|---|
| 安卓 | `ui/ChangePasswordDialog.kt`（新增）+ `ui/SettingsScreen.kt` | 设置 → 账号与云同步 → 「修改密码」按钮 |
| 网页 | `components/PasswordSettings.tsx`（新增）+ `components/SettingsPanel.tsx` | 设置 → 账号与同步 → 「修改密码」区块 |

两条链，两个端一致：

1. **知道旧密码**：旧密码 + 新密码 + 确认 → 保存。
2. **不记得旧密码**：填新密码 → 发邮箱验证码 → 填码 → 重置并自动登录。

为什么必须有第 2 条：早期版本用验证码注册时，本地存的是一个**随机密码**（用户根本不知道），
这种老账号只能靠邮箱验证码把密码重置掉。

### 3.2 接口

| 场景 | 方法 / 路径 | 请求体 | 说明 |
|---|---|---|---|
| 校验旧密码（sudo） | `POST /v1/user/sudo` | `{password}` + `Bearer` | 返回 `{sudo_token}` |
| 更新密码 | `PATCH /v1/user/password` | `{sudo_token, new_password}` + `Bearer` | 可能顺带回新会话 |
| 发重置码 | `POST /v1/verification` | `{email, usage:"PASSWORD_RESET", target:"USER"}` | 注意 `usage` 与登录不同 |
| 验重置码 | `POST /v1/verification/verify` | `{verification_id, verification_code}` | 同上 |
| 重置密码 | `POST /v1/reset` | `{email, new_password, verification_token}` | 之后用新密码登录一次 |

Kotlin：`changePasswordWithOld` / `sendPasswordResetCode` / `resetPasswordWithCode`。
TS：`cloud.auth.resetPasswordForOld` / `resetPasswordForEmail`（SDK 封装，内部就是上面这几个端点）。

### 3.3 「初始密码 123456」怎么落实

- 验证码**注册**（新账号）时，`/v1/signup` 的 `password` 传 `CloudAuth.DEFAULT_PASSWORD = "123456"`，
  两个端一致（网页 `LoginScreen` 里同名字符串）。
- 登录页明确提示：「新邮箱会自动注册，初始密码 123456」。
- 改过密码后 `CloudAuth.usesDefaultPassword = false`；仍是初始密码时，
  设置页账号区显示红字「当前仍在使用初始密码 123456，建议马上改掉」。

### 3.4 数据结构变化（安全性上的）

老代码在本地存了自动生成的随机密码：

```kotlin
prefs.edit { putString(KEY_SIGNUP_PASSWORD, password) }   // 已删除
```

这等于在设备上留一份可直接登录的凭据。现在**只存一个布尔标记** `uses_default_password`，
不存任何密码明文。

---

## 4. App 底部导航新增「AI」栏

### 4.1 页面

| 文件 | 作用 |
|---|---|
| `ui/AiScreen.kt`（新增） | AI 会话页：对话流 + 输入框 + 图片入口 |
| `ui/MainScreen.kt` | 导航从 3 栏变 4 栏：列表 / **AI** / 统计 / 设置 |
| `res/drawable/ic_ai.xml`（新增） | AI 图标（没引入 `material-icons-extended`，自绘 24dp 矢量） |
| `res/xml/file_paths.xml` + `AndroidManifest.xml` | `FileProvider`，给拍照用的临时文件开一个 `cacheDir/ai_shots/` |
| `data/ai/AiQuery.kt`（新增） | 查询条件 + 本地查询引擎 |
| `data/ai/AiPlanner.kt`（新增） | 意图 → 可执行计划（从 `AIDialog` 抽出来共用） |
| `data/ai/ImageUtil.kt`（新增） | 图片压缩成 data URL（从 `AIDialog` 抽出来共用） |
| `data/ai/AgnesProvider.kt` | 提示词重写：带今天日期 + 券清单 + `filters` 说明；JSON 清洗更宽容 |
| `data/ai/AIProvider.kt` | `AiIntent` 除 `intent` 外全给默认值；`AIContext` 增加 `today` |
| `ui/AIDialog.kt` | 改为复用 `AiPlanner` / `readImageAsDataUrl`（行为不变，删掉约 200 行重复实现） |

### 4.2 三个能力怎么分工

这是本次设计上最关键的一点：**模型只做翻译，不做事实来源**。

| 能力 | 谁负责 | 为什么 |
|---|---|---|
| 查到期情况 | 模型 → `filters`；`AiQueryEngine` 在本地按 `CouponRules` 算 | 卡片资产，日期被编错一天用户就白跑；而且不必每次把几十条券塞进上下文 |
| 新增记录 | 模型 → `changes`；`AiPlanner` 出草稿；用户点「确认执行」才落库 | 写操作必须可回看、可取消，且必须走 `CouponRepository.save`（打 `dirty` 才会同步上云） |
| 识图 | 拍照/选图 → 压到 1280 长边 JPEG80 → 多模态模型 → 同一个 `AiIntent` → 同一套草稿确认 | 识别结果和手打的一句话走同一条路，不用维护两套写入逻辑 |

查询的默认口径与首页「今日待办」同源（`CouponRules.isExpired` / `remainingDays` /
`beijingDateOf`），所以同一个问题在两个页面不会给出不同答案。

识图入口有两个：`AlertDialog` 里选「拍照 / 从相册选择」。拍照**不申请 CAMERA 权限**——
`ACTION_IMAGE_CAPTURE` 由系统相机 App 完成拍摄，调用方只需要一个可写的 `content://` Uri；
真申了 CAMERA 反而多一道运行时授权，用户拒了就用不了。

### 4.3 数据结构

全是本地内存模型，**不入库、不同步**：

```kotlin
// 会话气泡
data class ChatItem(id, fromUser, text, imageUri, answer)
sealed interface Answer {
    data class Results(result: AiQueryResult)   // 查询结果（结构化列表）
    data class Draft(plan: AiPlan)              // 待确认的写操作
    data class Note(body, isError, showListLink)// 文本/错误/成功回执
}

// 查询
data class AiQuery(preset, horizonDays, keyword, tag, minAmount)
enum class QueryPreset { TODAY, SOON, WEEK, MONTH, EXPIRED, USED, UNUSED, ALL }
data class AiQueryResult(headline, coupons, emptyHint)

// 意图 → 计划（两个入口共用）
sealed interface AiPlan { Create(coupon) / Update(before, after) / Delete(target) / Unsupported(reason) }
```

`AiIntent`（模型输出）保持原字段，但把 `targetId` / `changes` / `filters` / `reasoning`
改成有默认值——模型漏字段是常态，缺一个 `filters` 就整条解析失败、弹「不是合法 JSON」，
对用户毫无意义。

### 4.4 接口与数据库

- **AI 侧**：仍是 OpenAI 兼容的 `POST {baseUrl}/chat/completions`（助手配置在设置里，
  `aiAssistants` / `activeAssistantId`）。没有新增自建后端。
- **数据库**：`coupons` / `settings` 表**无任何变更**——AI 的查询读本地 Room，
  新增记录走现成的 `CouponRepository.save` → `dirty` → `CloudSyncEngine`。

---

## 5. 有没有数据库 / 协议变更

没有。逐项确认：

| 项 | 是否变更 |
|---|---|
| 表结构（`coupons` / `settings`） | 否 |
| RLS 策略（`owner_id = auth.uid()`） | 否 |
| 同步协议（先推后拉、乐观锁 `modified_at`、软删除 `deleted_at`） | 否 |
| 提醒规则（`remindDays` / 静默时段 / 按设备各算） | 否 |
| `shared/` 下的 schema / 契约用例 | 否 |

新增的只有**客户端本地的会话标记**（`uses_default_password`）和**内存里的对话模型**。

---

## 6. 升级注意

1. **Release 签名**：versionCode 8 → 10、versionName 2.6.0 → 2.7.1，可直接覆盖安装（签名不变）。
2. **老账号想用密码登录**：早期验证码注册的账号，本地那个随机密码用户并不知道 →
   用「不记得旧密码·邮箱验证」重置一次即可（网页/安卓都能改）。
3. **加密存储降级的用户**：升级后首次启动会自动重建存储，可能需要重新登录一次；
   之后设置页会显示一行灰字说明。
4. **新注册账号的默认密码是 123456**，属于「可被猜到」的凭据 —— 设置页有红字提醒，
   建议首次登录后立刻改掉。这是需求指定的初始值，不是安全建议。

---

## 7. 怎么验证

```bash
# 安卓：编译 + 单测 + 出包
cd android
JAVA_HOME=/c/Android/jdk-17 ./gradlew assembleDebug --offline
JAVA_HOME=/c/Android/jdk-17 ./gradlew testDebugUnitTest --offline

# 网页：类型检查 + 构建
cd web
npm install
npm run build

# 共享规则契约（本次没动 shared/，应当保持全绿）
node --experimental-strip-types scripts/contract-check.mjs
node --experimental-strip-types scripts/concurrency-check.mjs
```

手工回归清单：

- [ ] 全新设备（无历史数据）用验证码登录 → 能进主界面（这是原来的失败点）
- [ ] 用同一个邮箱在网页端登录 → 看到同一批券
- [ ] 密码注册 → 退出 → 用刚设的密码登录 → 成功
- [ ] 设置里改密码（走旧密码 123456）→ 退出 → 新密码能登、旧密码不能登
- [ ] 设置里走「不记得旧密码」→ 邮箱收码 → 重置 → 自动登录
- [ ] AI 栏问「这周有哪些券到期」→ 条数与列表页一致
- [ ] AI 栏让它加一张券 → 确认后列表出现、云端也有
- [ ] AI 栏拍照/选图识图 → 出草稿 → 确认后入库

---

## 8. 追加：设置块改为可折叠（2.7.1）

原来五块设置全展开，手机上要滑三四屏，改一个开关得先找半天。现在：

| 端 | 组件 | 行为 |
|---|---|---|
| 安卓 | `ui/SettingsScreen.kt` → `SettingsCard(title, subtitle, initiallyExpanded)` | 标题行整行可点，`AnimatedVisibility` 展开/收起；展开状态用 `rememberSaveable(title)` 记住 |
| 网页 | `components/SettingsPanel.tsx` → `Section`（新增 `defaultOpen`） | 标题行是 `<button aria-expanded>`，箭头旋转；内容用 `hidden` 隐藏而**不卸载** |

两个细节值得记下来：

1. **收起时保留一行摘要**，否则折叠后等于把信息藏了：账号显示邮箱（或"游客本地模式"）、
   WebDAV 显示地址（或"未配置 · 可选"）、AI 显示"3 个助手 · 默认 识图助手"、
   标签显示"N 个标签"、提醒显示"自动同步开 · 提前 7/3/1 天"。
2. 网页端**不能**用条件渲染来收起：`AiAssistantSettings`、`TagLibraryEditor` 有自己的组件状态，
   卸载会把用户填了一半的草稿清掉，所以用 CSS `hidden` 保留挂载。

默认只展开「账号」，其余收起。版本号 2.7.0 → 2.7.1（versionCode 10），可直接覆盖安装。
