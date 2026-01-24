# Vercel 环境变量配置指南

## 为什么需要配置环境变量？

当使用定时任务（如 cron-job.org）调用 API 时，无法通过 Cookie 传递配置信息。因此需要将 WebDAV 和 PushPlus 配置存储在 Vercel 的环境变量中。

---

## 环境变量列表

| 变量名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `WEBDAV_URL` | String | ✅ 是 | WebDAV 服务器地址 |
| `WEBDAV_USERNAME` | String | ✅ 是 | WebDAV 用户名 |
| `WEBDAV_PASSWORD` | String | ✅ 是 | WebDAV 密码 |
| `PUSHPLUS_TOKEN` | String | ✅ 是 | PushPlus Token |

---

## 配置步骤

### 1. 登录 Vercel Dashboard

访问：https://vercel.com/dashboard

### 2. 选择你的项目

找到你的优惠券管理应用项目并点击进入。

### 3. 进入 Settings 页面

点击顶部菜单的 "Settings" 标签。

### 4. 进入 Environment Variables

在左侧菜单中找到并点击 "Environment Variables"。

### 5. 添加环境变量

逐个添加以下环境变量：

#### WEBDAV_URL

- **Key**: `WEBDAV_URL`
- **Value**: 你的 WebDAV 地址
  - 坚果云示例：`https://dav.jianguoyun.com/dav/`
  - Nextcloud 示例：`https://your-nextcloud.com/remote.php/webdav/`
- **Environment**: 选择 `Production`, `Preview`, `Development`（全部选中）
- 点击 "Add"

#### WEBDAV_USERNAME

- **Key**: `WEBDAV_USERNAME`
- **Value**: 你的 WebDAV 用户名
- **Environment**: 全部选中
- 点击 "Add"

#### WEBDAV_PASSWORD

- **Key**: `WEBDAV_PASSWORD`
- **Value**: 你的 WebDAV 密码
- **Environment**: 全部选中
- 点击 "Add"

#### PUSHPLUS_TOKEN

- **Key**: `PUSHPLUS_TOKEN`
- **Value**: 你的 PushPlus Token
- 如何获取：访问 http://www.pushplus.plus/，登录后在"消息推送"页面复制 Token
- **Environment**: 全部选中
- 点击 "Add"

### 6. 重新部署

添加完所有环境变量后，需要重新部署项目才能生效：

1. 点击顶部菜单的 "Deployments" 标签
2. 找到最新的部署记录
3. 点击右侧的 "..." 菜单
4. 选择 "Redeploy"
5. 确认重新部署

---

## 配置示例

### 坚果云用户

```
WEBDAV_URL = https://dav.jianguoyun.com/dav/
WEBDAV_USERNAME = your_email@example.com
WEBDAV_PASSWORD = your_app_password
PUSHPLUS_TOKEN = a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Nextcloud 用户

```
WEBDAV_URL = https://your-nextcloud.com/remote.php/webdav/
WEBDAV_USERNAME = your_username
WEBDAV_PASSWORD = your_password
PUSHPLUS_TOKEN = a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### 群晖 NAS 用户

```
WEBDAV_URL = https://your-nas.com:5006/
WEBDAV_USERNAME = your_username
WEBDAV_PASSWORD = your_password
PUSHPLUS_TOKEN = a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

---

## 验证配置

### 方法一：通过 Vercel Logs

1. 在 Vercel Dashboard 中进入你的项目
2. 点击 "Logs" 标签
3. 选择 "Production" 环境
4. 刷新页面，检查是否有环境变量加载错误

### 方法二：手动调用 API

在浏览器或使用 curl 访问：

```bash
curl https://你的应用地址.vercel.app/api/check-expiring
```

**成功响应**：
```json
{
  "success": true,
  "message": "检查完成，发送了 0 条提醒",
  "data": {
    "results": { "7": 0, "3": 0, "1": 0 },
    "totalSent": 0
  }
}
```

**失败响应**：
```json
{
  "success": false,
  "error": "请先配置 WebDAV（通过应用界面或环境变量）"
}
```

### 方法三：在 cron-job.org 测试

1. 登录 cron-job.org
2. 找到你的定时任务
3. 点击 "Execute now"
4. 查看执行日志，确认返回 200 状态码

---

## 常见问题

### Q1: 配置后为什么还是 401 Unauthorized？

**A**: 可能的原因：
1. 环境变量值填写错误
2. 环境变量名称拼写错误（注意大小写）
3. 没有重新部署项目

**解决方法**：
1. 检查环境变量名称和值是否正确
2. 确保在 Environment Variables 中选择了正确的 Environment（Production）
3. 重新部署项目

### Q2: 如何确认环境变量已生效？

**A**:
1. 访问 `/api/check-expiring`
2. 如果成功返回 JSON 数据，说明环境变量已生效
3. 如果返回错误，检查环境变量配置

### Q3: 可以只在 Production 环境配置吗？

**A**: 可以，但建议同时配置 Development 和 Preview，方便本地开发和预览测试。

### Q4: 环境变量安全吗？

**A**: 是的。Vercel 的环境变量是加密存储的，不会暴露在客户端代码中。只有在服务端（API Routes）可以访问。

### Q5: 修改环境变量后需要做什么？

**A**: 需要重新部署项目才能生效：
1. 点击 "Deployments"
2. 选择最新的部署
3. 点击 "Redeploy"

### Q6: 可以从应用界面查看环境变量吗？

**A**: 不可以。环境变量只能在 Vercel Dashboard 中配置和查看，不会暴露给普通用户。

---

## 配置优先级

API 会按以下优先级读取配置：

1. **环境变量**（最高优先级）
   - 适用于定时任务
   - 适用于命令行调用

2. **Cookie**
   - 适用于用户在应用界面配置
   - 适用于浏览器访问

这种设计确保：
- 定时任务可以正常工作（使用环境变量）
- 用户仍然可以通过应用界面配置（使用 Cookie）
- 两套配置系统互不冲突

---

## 完整配置流程总结

1. ✅ 在 Vercel 中添加 4 个环境变量
2. ✅ 重新部署项目
3. ✅ 在 cron-job.org 中创建定时任务
4. ✅ 手动执行测试，确认返回 200
5. ✅ 检查微信是否收到推送
6. ✅ 等待定时任务自动运行

---

## 安全提示

- ⚠️ 不要将环境变量提交到 Git
- ⚠️ 不要在代码中硬编码配置信息
- ⚠️ 定期更换 PushPlus Token
- ⚠️ 使用强密码保护 WebDAV 账户

---

## 下一步

配置完成后：

1. **测试定时任务**：在 cron-job.org 手动执行一次
2. **检查推送**：确认微信收到提醒
3. **设置自动运行**：定时任务已配置，每天早上7点自动运行

所有配置完成后，系统将自动工作，无需人工干预！
